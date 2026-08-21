# 16. Pipeline: mixed code + data/schema change

Mixed change получает максимальный risk из составляющих.

Порядок:

1. code/schema plan;
2. data migration plan;
3. combined approval;
4. isolated workspace;
5. migration on clone;
6. preview image + preview DB;
7. acceptance;
8. backup;
9. deploy compatible code phase A;
10. run forward migration;
11. deploy code phase B при expand-contract;
12. verify data and storefront;
13. close.

Для потенциально необратимой migration запрещён автоматический production deploy без Agency Operator approval.

---

