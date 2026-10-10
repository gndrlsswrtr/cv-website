import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-[60vh] w-full max-w-5xl flex-col justify-center px-5 py-16 sm:px-8">
      <p className="eyebrow mb-3">404</p>
      <h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
        The page you are looking for does not exist, or it is not published.
      </p>
      <div className="mt-7">
        <Link href="/" className="btn btn-primary">
          Back to the home page
        </Link>
      </div>
    </main>
  );
}
