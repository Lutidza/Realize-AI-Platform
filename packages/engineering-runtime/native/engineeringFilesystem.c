/**
 * @file packages/engineering-runtime/native/engineeringFilesystem.c
 * @version 1.2.1
 * @date 2026-10-28
 * @description Предоставляет синхронные Linux guards и exact-identity rename/exchange через Node-API 8.
 * @see documentation/architecture/engineering-operations.md
 */
#define _GNU_SOURCE
#include <node_api.h>
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <linux/fs.h>
#include <math.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/stat.h>
#include <sys/xattr.h>
#include <unistd.h>

#if NAPI_VERSION != 8
#error "Engineering native requires the stable Node-API 8 subset"
#endif

static napi_value fail(napi_env env, const char *code, const char *message) {
  napi_throw_error(env, code, message);
  return NULL;
}

static bool descriptor(napi_env env, napi_value value, int *result) {
  double number;
  if (napi_get_value_double(env, value, &number) != napi_ok ||
      !isfinite(number) || number < 0 || number > INT_MAX ||
      number != (double)(int)number) {
    fail(env, "UNSUPPORTED", "Ожидается целочисленный открытый descriptor.");
    return false;
  }
  *result = (int)number;
  return true;
}

static bool component(napi_env env, napi_value value, char result[NAME_MAX + 1]) {
  size_t length = 0;
  size_t written = 0;
  if (napi_get_value_string_utf8(env, value, NULL, 0, &length) != napi_ok ||
      length == 0 || length > NAME_MAX ||
      napi_get_value_string_utf8(env, value, result, NAME_MAX + 1, &written) != napi_ok ||
      written != length || memchr(result, '\0', written) != NULL ||
      strchr(result, '/') != NULL || strcmp(result, ".") == 0 ||
      strcmp(result, "..") == 0) {
    fail(env, "UNSUPPORTED", "Ожидается одно непустое имя без traversal и NUL.");
    return false;
  }
  return true;
}

static bool decimal_identity(napi_env env, napi_value value, uint64_t *result) {
  char text[32];
  size_t length = 0;
  if (napi_get_value_string_utf8(env, value, text, sizeof(text), &length) != napi_ok ||
      length == 0 || length >= sizeof(text) || text[length] != '\0') {
    fail(env, "UNSUPPORTED", "Ожидалась decimal filesystem identity.");
    return false;
  }
  char *end = NULL;
  for (size_t index = 0; index < length; index++) {
    if (text[index] < '0' || text[index] > '9') {
      fail(env, "UNSUPPORTED", "Filesystem identity должна быть decimal digits.");
      return false;
    }
  }
  errno = 0;
  unsigned long long parsed = strtoull(text, &end, 10);
  if (errno != 0 || end == text || *end != '\0') {
    fail(env, "UNSUPPORTED", "Некорректная decimal filesystem identity.");
    return false;
  }
  *result = (uint64_t)parsed;
  return true;
}

/* Проверка типа работает и для O_PATH, не открывая device/FIFO для чтения. */
static bool inspect_type(napi_env env, int fd, bool directory_only, struct stat *identity) {
  if (fstat(fd, identity) != 0) {
    fail(env, "CONFLICT", "Descriptor объекта недоступен.");
    return false;
  }
  if ((!S_ISREG(identity->st_mode) && !S_ISDIR(identity->st_mode)) ||
      (directory_only && !S_ISDIR(identity->st_mode)) ||
      (S_ISREG(identity->st_mode) && identity->st_nlink != 1) ||
      identity->st_nlink == 0 || (identity->st_mode & 07000) != 0) {
    fail(env, "UNSUPPORTED", "Тип, links или mode объекта не поддерживаются.");
    return false;
  }
  return true;
}

/* Отклонение xattrs также запрещает POSIX access/default ACL и capabilities. */
static bool inspect(napi_env env, int fd, bool directory_only, struct stat *identity) {
  if (!inspect_type(env, fd, directory_only, identity)) return false;
  if (flistxattr(fd, NULL, 0) != 0) {
    fail(env, "UNSUPPORTED", "Объект имеет xattrs/ACL либо их проверка недоступна.");
    return false;
  }
  int flags = 0;
  if (ioctl(fd, FS_IOC_GETFLAGS, &flags) != 0 ||
      (flags & (FS_CASEFOLD_FL | FS_ENCRYPT_FL | FS_IMMUTABLE_FL | FS_APPEND_FL | FS_VERITY_FL)) != 0) {
    fail(env, "UNSUPPORTED", "Inode flags не поддерживаются либо их проверка недоступна.");
    return false;
  }
  return true;
}

/* O_PATH не поддерживает flistxattr/ioctl: проверяем тот же pinned inode через readable descriptor. */
static bool inspect_pinned(napi_env env, int fd, const struct stat *expected) {
  char path[64];
  int length = snprintf(path, sizeof(path), "/proc/self/fd/%d", fd);
  if (length < 0 || (size_t)length >= sizeof(path)) {
    fail(env, "INTERNAL_ERROR", "Не удалось адресовать pinned descriptor.");
    return false;
  }
  int readable = open(path, O_RDONLY | O_NONBLOCK | O_CLOEXEC |
                      (S_ISDIR(expected->st_mode) ? O_DIRECTORY : 0));
  if (readable < 0) {
    fail(env, "CONFLICT", "Pinned объект недоступен.");
    return false;
  }
  struct stat actual;
  bool safe = inspect(env, readable, false, &actual);
  close(readable);
  if (!safe) return false;
  if (actual.st_dev != expected->st_dev || actual.st_ino != expected->st_ino) {
    fail(env, "CONFLICT", "Identity pinned объекта изменилась.");
    return false;
  }
  return true;
}

static napi_value inspect_fd(napi_env env, napi_callback_info info) {
  napi_value arguments[2];
  size_t count = 2;
  int fd;
  struct stat identity;
  if (napi_get_cb_info(env, info, &count, arguments, NULL, NULL) != napi_ok || count != 1)
    return fail(env, "UNSUPPORTED", "inspectFd требует один descriptor.");
  if (!descriptor(env, arguments[0], &fd) || !inspect(env, fd, false, &identity)) return NULL;
  napi_value result;
  if (napi_get_undefined(env, &result) != napi_ok)
    return fail(env, "INTERNAL_ERROR", "Не удалось завершить native вызов.");
  return result;
}

/* Ровно один изменяющий syscall. Fsync и durable journal принадлежат вызывающему adapter. */
static napi_value rename_no_replace(napi_env env, napi_callback_info info) {
  napi_value arguments[7];
  size_t count = 7;
  int source_parent;
  int target_parent;
  char source_name[NAME_MAX + 1];
  char target_name[NAME_MAX + 1];
  struct stat source_parent_stat, target_parent_stat, source_stat, current_stat;
  bool has_expected_source = false;
  uint64_t expected_source_dev = 0, expected_source_ino = 0;
  if (napi_get_cb_info(env, info, &count, arguments, NULL, NULL) != napi_ok ||
      (count != 4 && count != 6))
    return fail(env, "UNSUPPORTED", "renameNoReplace принимает descriptors, имена и необязательную source identity.");
  has_expected_source = count == 6;
  if (!descriptor(env, arguments[0], &source_parent) ||
      !component(env, arguments[1], source_name) ||
      !descriptor(env, arguments[2], &target_parent) ||
      !component(env, arguments[3], target_name) ||
      (has_expected_source &&
       (!decimal_identity(env, arguments[4], &expected_source_dev) ||
        !decimal_identity(env, arguments[5], &expected_source_ino))) ||
      !inspect(env, source_parent, true, &source_parent_stat) ||
      !inspect(env, target_parent, true, &target_parent_stat)) return NULL;
  if (source_parent_stat.st_dev != target_parent_stat.st_dev)
    return fail(env, "UNSUPPORTED", "Publication между filesystems запрещена.");

  int source = openat(source_parent, source_name, O_PATH | O_NOFOLLOW | O_CLOEXEC);
  if (source < 0)
    return fail(env, errno == ELOOP ? "UNSUPPORTED" : "CONFLICT", "Подготовленный объект недоступен.");
  if (!inspect_type(env, source, false, &source_stat)) {
    close(source);
    return NULL;
  }
  if (has_expected_source &&
      ((uint64_t)source_stat.st_dev != expected_source_dev ||
       (uint64_t)source_stat.st_ino != expected_source_ino)) {
    close(source);
    return fail(env, "CONFLICT", "Source identity изменилась до rename.");
  }
  bool safe = inspect_pinned(env, source, &source_stat);
  close(source);
  if (!safe) return NULL;
  if (fstatat(source_parent, source_name, &current_stat, AT_SYMLINK_NOFOLLOW) != 0 ||
      current_stat.st_dev != source_stat.st_dev || current_stat.st_ino != source_stat.st_ino)
    return fail(env, "CONFLICT", "Identity подготовленного объекта изменилась.");

  if (renameat2(source_parent, source_name, target_parent, target_name, RENAME_NOREPLACE) != 0) {
    int failure = errno;
    if (failure == EEXIST || failure == ENOTEMPTY || failure == ENOENT || failure == ENOTDIR)
      return fail(env, "CONFLICT", "Publication конфликтует с текущим namespace.");
    if (failure == EXDEV || failure == ENOSYS || failure == EINVAL || failure == EOPNOTSUPP || failure == EPERM || failure == EACCES)
      return fail(env, "UNSUPPORTED", "Kernel или filesystem не поддерживает допущенную publication.");
    return fail(env, "INTERNAL_ERROR", "Не удалось выполнить native publication.");
  }
  napi_value result;
  if (napi_get_undefined(env, &result) != napi_ok)
    return fail(env, "INTERNAL_ERROR", "Publication выполнена, native ответ недоступен.");
  return result;
}

/* Меняет местами только проверенные regular files; исходный inode остаётся доступен для recovery. */
static napi_value rename_exchange(napi_env env, napi_callback_info info) {
  napi_value arguments[9];
  size_t count = 9;
  int source_parent, target_parent;
  uint64_t expected_source_dev, expected_source_ino, expected_target_dev, expected_target_ino;
  char source_name[NAME_MAX + 1], target_name[NAME_MAX + 1];
  struct stat source_parent_stat, target_parent_stat, source_stat, target_stat;
  struct stat current_source, current_target;
  if (napi_get_cb_info(env, info, &count, arguments, NULL, NULL) != napi_ok || count != 8)
    return fail(env, "UNSUPPORTED", "renameExchange требует descriptors, имена и две identity.");
  if (!descriptor(env, arguments[0], &source_parent) ||
      !component(env, arguments[1], source_name) ||
      !descriptor(env, arguments[2], &target_parent) ||
      !component(env, arguments[3], target_name) ||
      !decimal_identity(env, arguments[4], &expected_source_dev) ||
      !decimal_identity(env, arguments[5], &expected_source_ino) ||
      !decimal_identity(env, arguments[6], &expected_target_dev) ||
      !decimal_identity(env, arguments[7], &expected_target_ino) ||
      !inspect(env, source_parent, true, &source_parent_stat) ||
      !inspect(env, target_parent, true, &target_parent_stat)) return NULL;
  if (source_parent_stat.st_dev != target_parent_stat.st_dev)
    return fail(env, "UNSUPPORTED", "Edit между filesystems запрещён.");
  int source = openat(source_parent, source_name, O_PATH | O_NOFOLLOW | O_CLOEXEC);
  int target = openat(target_parent, target_name, O_PATH | O_NOFOLLOW | O_CLOEXEC);
  if (source < 0 || target < 0) {
    if (source >= 0) close(source);
    if (target >= 0) close(target);
    return fail(env, "CONFLICT", "Исходный или целевой файл изменился.");
  }
  bool safe_types = inspect_type(env, source, false, &source_stat) &&
                    inspect_type(env, target, false, &target_stat);
  bool safe_metadata = safe_types && inspect_pinned(env, source, &source_stat) &&
                       inspect_pinned(env, target, &target_stat);
  close(source);
  close(target);
  if (!safe_metadata) return NULL;
  if (!S_ISREG(source_stat.st_mode) || !S_ISREG(target_stat.st_mode) ||
      source_stat.st_dev != target_stat.st_dev)
    return fail(env, "UNSUPPORTED", "Atomic edit поддерживает только regular files одного filesystem.");
  if ((uint64_t)source_stat.st_dev != expected_source_dev ||
      (uint64_t)source_stat.st_ino != expected_source_ino ||
      (uint64_t)target_stat.st_dev != expected_target_dev ||
      (uint64_t)target_stat.st_ino != expected_target_ino)
    return fail(env, "CONFLICT", "Исходная или целевая identity изменилась перед atomic edit.");
  if (fstatat(source_parent, source_name, &current_source, AT_SYMLINK_NOFOLLOW) != 0 ||
      fstatat(target_parent, target_name, &current_target, AT_SYMLINK_NOFOLLOW) != 0 ||
      current_source.st_dev != source_stat.st_dev || current_source.st_ino != source_stat.st_ino ||
      current_target.st_dev != target_stat.st_dev || current_target.st_ino != target_stat.st_ino)
    return fail(env, "CONFLICT", "Identity файла изменилась перед atomic edit.");
  if (renameat2(source_parent, source_name, target_parent, target_name, RENAME_EXCHANGE) != 0) {
    int failure = errno;
    if (failure == ENOENT || failure == ENOTDIR || failure == ELOOP)
      return fail(env, "CONFLICT", "Atomic edit конфликтует с текущим namespace.");
    if (failure == EXDEV || failure == ENOSYS || failure == EINVAL || failure == EOPNOTSUPP || failure == EPERM || failure == EACCES)
      return fail(env, "UNSUPPORTED", "Kernel или filesystem не поддерживает atomic exchange.");
    return fail(env, "INTERNAL_ERROR", "Не удалось выполнить atomic file exchange.");
  }
  napi_value result;
  if (napi_get_undefined(env, &result) != napi_ok)
    return fail(env, "INTERNAL_ERROR", "Atomic edit выполнен, native ответ недоступен.");
  return result;
}

NAPI_MODULE_INIT() {
  napi_property_descriptor methods[] = {
    {"renameNoReplace", NULL, rename_no_replace, NULL, NULL, NULL, napi_default, NULL},
    {"renameExchange", NULL, rename_exchange, NULL, NULL, NULL, napi_default, NULL},
    {"inspectFd", NULL, inspect_fd, NULL, NULL, NULL, napi_default, NULL}
  };
  if (napi_define_properties(env, exports, sizeof(methods) / sizeof(methods[0]), methods) != napi_ok)
    return fail(env, "INTERNAL_ERROR", "Не удалось зарегистрировать native API.");
  return exports;
}
