import { Fragment } from 'react';
import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';

export interface Crumb {
  label: string;
  to?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
      {items.map((c, i) => (
        <Fragment key={c.label}>
          {i > 0 && <ChevronRight className="h-3 w-3 text-slate-400" />}
          {c.to ? (
            <Link to={c.to} className="hover:text-blue-600">
              {c.label}
            </Link>
          ) : (
            <span className="text-slate-400" aria-current="page">
              {c.label}
            </span>
          )}
        </Fragment>
      ))}
    </nav>
  );
}
