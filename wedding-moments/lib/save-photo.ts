export type SaveResult = "shared" | "downloaded";

export async function savePhotoToDevice(url:string,filename:string):Promise<SaveResult>{
  const response=await fetch(url);if(!response.ok)throw new Error("Không thể tải ảnh");
  const blob=await response.blob();const safeName=filename.replace(/[^a-z0-9._-]/gi,"-");
  const file=new File([blob],safeName,{type:blob.type||"image/jpeg"});
  const isMobile=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
  if(isMobile&&typeof navigator.share==="function"&&typeof navigator.canShare==="function"&&navigator.canShare({files:[file]})){
    await navigator.share({files:[file],title:"Lưu ảnh cưới",text:"Chọn “Lưu hình ảnh” để thêm ảnh vào thư viện trên điện thoại."});
    return "shared";
  }
  const objectUrl=URL.createObjectURL(blob);const link=document.createElement("a");link.href=objectUrl;link.download=safeName;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);return "downloaded";
}
