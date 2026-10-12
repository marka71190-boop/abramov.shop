import Link from "next/link";
import { rub } from "@/lib/format";
import type { RatingInfo } from "@/lib/reviews";
import { FavoriteButton } from "./FavoriteButton";
import { Stars } from "./Stars";

interface CardProduct {
  id: string;
  slug: string;
  name: string;
  price: number;
  oldPrice: number | null;
  stock: number;
  image: { url: string; alt: string } | null;
}

export function ProductCard({ p, rating, favorite }: { p: CardProduct; rating?: RatingInfo; favorite: boolean }) {
  return (
    <div className="pcard-wrap">
      <Link href={`/product/${p.slug}`} className="pcard">
        {p.image ? <img className="pcard__img" src={p.image.url} alt={p.image.alt} /> : <div className="pcard__img" />}
        <div className="pcard__body">
          <div className="pcard__name">{p.name}</div>
          {rating && (
            <div className="row small" style={{ gap: 6 }}>
              <Stars value={rating.avg} size={14} /> <span className="muted">{rating.count}</span>
            </div>
          )}
          <div className="pcard__price">
            {rub(p.price)}
            {p.oldPrice ? <span className="old-price">{rub(p.oldPrice)}</span> : null}
          </div>
          {p.stock <= 0 && <div className="muted small">Нет в наличии</div>}
        </div>
      </Link>
      <FavoriteButton productId={p.id} initial={favorite} />
    </div>
  );
}
