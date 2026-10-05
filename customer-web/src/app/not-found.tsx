import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="py-24 text-center">
      <p className="text-sm font-medium text-muted">404</p>
      <h1 className="mt-2 text-2xl font-semibold">Page not found</h1>
      <Link href="/" className="mt-6 inline-block rounded-xl bg-inverse px-4 py-2.5 text-sm font-medium text-inverse-fg">
        Back to shop
      </Link>
    </div>
  );
}
