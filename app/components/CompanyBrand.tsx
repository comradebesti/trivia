"use client";
import { useState } from "react";
export default function CompanyBrand() {
 const [missing,setMissing]=useState(false);
 return <div className="brand">{!missing ? <img src="/favicon.jpg?v=20261007-1105" alt="Company logo" onError={()=>setMissing(true)} style={{maxWidth:220,maxHeight:56,width:"auto",height:"auto",objectFit:"contain"}}/> : <span className="brandmark">✳</span>} TEAM <b>TRIVIA</b></div>;
}
