import Link from "next/link";
import { ArrowDown, CalendarDays, Heart, Images, LockKeyhole } from "lucide-react";
import { albums, photos } from "@/lib/mock-data";

export default function Home() {
  return (
    <main>
      <section className="hero-shell">
        <img className="hero-image" src="/wedding-hero.webp" alt="Minh Anh và Hoàng Nam trong ánh hoàng hôn" fetchPriority="high" />
        <div className="hero-shade" />
        <header className="site-header">
          <Link href="/" className="brand" aria-label="Wedding Moments - Trang chủ">WM</Link>
          <nav aria-label="Điều hướng chính">
            <Link href="#journey">Câu chuyện</Link>
            <Link href="/album/le-thanh-hon">Thư viện</Link>
            <Link href="/favorites"><Heart size={17} /> Yêu thích</Link>
          </nav>
        </header>
        <div className="hero-copy">
          <p className="eyebrow">Wedding moments · 18.10.2026</p>
          <h1>Minh Anh <i>&amp;</i><br />Hoàng Nam</h1>
          <p className="hero-note">Một ngày để nhớ. Một câu chuyện để giữ mãi.</p>
          <Link className="hero-cta" href="/album/le-thanh-hon">Khám phá khoảnh khắc <ArrowDown size={18} /></Link>
        </div>
        <div className="hero-meta">
          <span><CalendarDays size={16} /> Hà Nội, Việt Nam</span>
          <span><Images size={16} /> {photos.length * 28 + 13} khoảnh khắc</span>
          <span><LockKeyhole size={15} /> Thư viện riêng tư</span>
        </div>
      </section>

      <section id="journey" className="journey section-wrap">
        <div className="section-intro">
          <p className="eyebrow ink">Our story · Hành trình của chúng mình</p>
          <h2>Từng khoảnh khắc,<br /><em>một phần ký ức.</em></h2>
          <p>Từ buổi chiều dịu nắng đến lời hẹn ước trước gia đình — tất cả được lưu lại như cách chúng mình đã cảm nhận.</p>
        </div>
        <div className="album-list">
          {albums.map((album, index) => (
            <Link className="album-row" href={`/album/${album.slug}`} key={album.slug}>
              <span className="album-number">0{index + 1}</span>
              <div><h3>{album.name}</h3><p>{album.time} · {album.count} ảnh</p></div>
              <span className="album-arrow">↗</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="featured-strip" aria-label="Ảnh nổi bật">
        <figure className="feature portrait"><img src="/wedding-portrait.webp" alt="Khoảnh khắc trong lễ thành hôn" loading="lazy" /></figure>
        <div className="featured-quote"><span>“</span><p>Chúng mình đã ở đây,<br />cùng những người thương nhất.</p><small>MINH ANH &amp; HOÀNG NAM</small></div>
        <figure className="feature landscape"><img src="/wedding-reception.webp" alt="Tiệc cưới ấm áp cùng gia đình và bạn bè" loading="lazy" /></figure>
      </section>

      <footer><span>WEDDING MOMENTS</span><p>Made for memories, kept with care.</p><Link href="/admin">Quản trị</Link></footer>
    </main>
  );
}
