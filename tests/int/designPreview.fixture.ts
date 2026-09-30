/**
 * @file tests/int/designPreview.fixture.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Создаёт исполняемый автономный React макет для настоящего sandbox capture.
 * @see documentation/specifications/design-workshop.md
 */
import { designProjectFixture } from "./designWorkshop.fixture";
export function designPreviewFixture() {
  const project = designProjectFixture();
  project.snapshot.files = [
    {
      path: "src/Preview.tsx",
      content:
        'import React,{useState} from "react"; import styles from "./Preview.module.css"; export default function App(){const [count,setCount]=useState(3);return <main className={styles.page}><header><span>REALIZE / МАСТЕРСКАЯ</span><h1>Рабочее пространство</h1><p>Демонстрационный макет · сохранённая версия</p></header><section className={styles.grid}>{["Дизайн","Разработка","Проверка"].map((title,index)=><article key={title}><small>0{index+1}</small><h2>{title}</h2><p>Согласовать детали интерфейса и состояния компонента.</p><button onClick={()=>setCount(count+1)}>Задачи: {count}</button></article>)}</section></main>}',
    },
    {
      path: "src/Preview.module.css",
      content:
        ".page{min-height:100vh;background:#f3f4f6;color:#17222c;padding:40px;font-family:Arial,sans-serif}.page header{max-width:720px;margin-bottom:36px}.page span{font-size:11px;letter-spacing:2px;color:#596674}.page h1{font-size:36px;line-height:1.12;margin:18px 0}.page p{font-size:15px;line-height:1.6;color:#64717e}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}.grid article{background:#fff;border:1px solid #dfe4e8;border-radius:16px;padding:24px}.grid small{color:#687d99}.grid h2{font-size:21px}.grid button{border:0;border-radius:8px;background:#1d4167;color:white;padding:10px 16px}.grid button:focus-visible{outline:3px solid #5783bf;outline-offset:3px}@media(max-width:850px){.grid{grid-template-columns:1fr}.page{padding:24px}.page h1{font-size:30px}.grid article{padding:20px}}",
    },
  ];
  return project;
}
