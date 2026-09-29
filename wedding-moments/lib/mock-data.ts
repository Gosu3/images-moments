export type Photo = { id:string; src:string; preview:string; alt:string; width:number; height:number; album:string; takenAt:string };
export const albums = [
  { slug:"pre-wedding", name:"Pre Wedding", time:"12.09.2026", count:84 },
  { slug:"le-an-hoi", name:"Lễ Ăn Hỏi", time:"10.10.2026", count:126 },
  { slug:"don-dau", name:"Đón Dâu", time:"18.10 · 07:30", count:178 },
  { slug:"le-thanh-hon", name:"Lễ Thành Hôn", time:"18.10 · 10:30", count:437 },
  { slug:"wedding-party", name:"Wedding Party", time:"18.10 · 18:00", count:312 },
];
export const photos: Photo[] = [];
