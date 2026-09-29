export type Photo = { id:string; src:string; preview:string; alt:string; width:number; height:number; album:string; takenAt:string };
export const albums = [
  { slug:"pre-wedding", name:"Pre Wedding", time:"12.09.2026", count:84 },
  { slug:"le-an-hoi", name:"Lễ Ăn Hỏi", time:"10.10.2026", count:126 },
  { slug:"don-dau", name:"Đón Dâu", time:"18.10 · 07:30", count:178 },
  { slug:"le-thanh-hon", name:"Lễ Thành Hôn", time:"18.10 · 10:30", count:437 },
  { slug:"wedding-party", name:"Wedding Party", time:"18.10 · 18:00", count:312 },
];
const seeds = [
  ["/wedding-hero.webp", 1536, 1024, "Minh Anh và Hoàng Nam dưới nắng chiều"],
  ["/wedding-portrait.webp", 1024, 1536, "Cô dâu chú rể trong lễ thành hôn"],
  ["/wedding-reception.webp", 1536, 1024, "Niềm vui trong tiệc cưới"],
] as const;
export const photos: Photo[] = Array.from({length:18},(_,i)=>{
  const seed=seeds[i%seeds.length];
  return {id:`photo-${i+1}`,src:seed[0],preview:seed[0],width:seed[1],height:seed[2],alt:`${seed[3]} — ảnh ${i+1}`,album:"le-thanh-hon",takenAt:`${10+Math.floor(i/4)}:${String((i*7)%60).padStart(2,"0")}`};
});
