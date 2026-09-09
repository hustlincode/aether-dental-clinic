export function UpcomingModule({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-text">{title}</h1>
      <div className="mt-6 flex flex-col items-center rounded-2xl border border-dashed border-border bg-surface py-20 text-center">
        <div className="text-4xl">🚧</div>
        <h2 className="mt-3 text-lg font-semibold text-text-secondary">Coming soon</h2>
        <p className="mt-1 max-w-sm text-sm text-text-muted">{description}</p>
      </div>
    </div>
  );
}
