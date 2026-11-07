export default function Loading() {
  return (
    <main className="loading-page" aria-busy="true" aria-label="Loading opportunities">
      <div className="skeleton" />
      <p>Loading competitions…</p>
      <div className="loading-cards">
        {[1, 2, 3, 4, 5, 6].map((item) => (
          <div key={item} className="skeleton" />
        ))}
      </div>
    </main>
  );
}
