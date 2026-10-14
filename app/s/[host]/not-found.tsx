import Link from "next/link";

export default function SiteNotFound() {
  return (
    <section className="section">
      <div className="container narrow center">
        <h1 className="section-title">We could not find that page</h1>
        <p className="lead">It may have moved. Try the product catalog or contact us.</p>
        <div className="actions">
          <Link className="btn btn-primary" href="/products">Browse products</Link>
          <Link className="btn btn-secondary" href="/contact">Contact us</Link>
        </div>
      </div>
    </section>
  );
}
