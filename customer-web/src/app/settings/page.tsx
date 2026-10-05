'use client';

import Link from 'next/link';
import { Check, Laptop, Moon, Package, Palette, RotateCcw, Sun, UserRound } from 'lucide-react';
import { useAuth } from '@/context/auth';
import { ACCENTS, useTheme, type ThemeMode } from '@/context/theme';
import { AccountLayout } from '@/components/AccountLayout';
import { Button, cx } from '@/components/ui';

const MODES: { value: ThemeMode; label: string; body: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', body: 'Bright and clean', icon: Sun },
  { value: 'dark', label: 'Dark', body: 'Easy on the eyes at night', icon: Moon },
  { value: 'system', label: 'System', body: 'Match your device', icon: Laptop },
];

/** Miniature storefront drawn in the colours of a theme, so each option previews itself. */
function Preview({ dark, half }: { dark: boolean; half?: boolean }) {
  const c = dark
    ? { bg: '#0a0e15', card: '#121823', line: '#222b39', text: '#e8ecf2', muted: '#334155' }
    : { bg: '#f5f6f8', card: '#ffffff', line: '#e5e7eb', text: '#0f172a', muted: '#cbd5e1' };
  return (
    <div className={cx('h-full p-2.5', half && 'w-1/2')} style={{ background: c.bg }}>
      <div className="flex items-center gap-1.5 rounded-md px-1.5 py-1" style={{ background: c.card, border: `1px solid ${c.line}` }}>
        <span className="size-2.5 rounded-sm bg-primary" />
        <span className="h-1.5 w-8 rounded-full" style={{ background: c.muted }} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-md p-1.5" style={{ background: c.card, border: `1px solid ${c.line}` }}>
            <div className="aspect-[4/3] rounded" style={{ background: c.muted, opacity: 0.6 }} />
            <div className="mt-1.5 h-1 w-3/4 rounded-full" style={{ background: c.text, opacity: 0.7 }} />
            <div className="mt-1.5 h-2 rounded bg-primary" />
          </div>
        ))}
      </div>
    </div>
  );
}

function Section({ id, icon, title, body, children }: { id?: string; icon: React.ReactNode; title: string; body: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-40 rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">{icon}</span>
        <div>
          <h2 className="font-semibold text-fg">{title}</h2>
          <p className="text-sm text-muted">{body}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  const { mode, accent, resolved, setMode, setAccent } = useTheme();
  const { customer } = useAuth();

  return (
    <AccountLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">Settings</h1>
          <p className="mt-1 text-sm text-muted">Personalise how the store looks. Your choice is saved on this device.</p>
        </div>

        <Section id="appearance" icon={<Sun className="size-5" />} title="Theme" body={`Currently showing the ${resolved} theme.`}>
          <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Theme">
            {MODES.map(({ value, label, body, icon: Icon }) => {
              const selected = mode === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setMode(value)}
                  className={cx(
                    'group overflow-hidden rounded-2xl border-2 text-left transition-all',
                    selected ? 'border-primary shadow-lg shadow-primary/15' : 'border-line hover:border-line-2',
                  )}
                >
                  <div className="flex h-28 overflow-hidden border-b border-line">
                    {value === 'system' ? (
                      <>
                        <Preview dark={false} half />
                        <Preview dark half />
                      </>
                    ) : (
                      <div className="w-full">
                        <Preview dark={value === 'dark'} />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 p-3.5">
                    <Icon className={cx('size-5', selected ? 'text-primary' : 'text-muted')} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-fg">{label}</span>
                      <span className="block truncate text-xs text-muted">{body}</span>
                    </span>
                    <span
                      className={cx(
                        'flex size-5 shrink-0 items-center justify-center rounded-full border-2',
                        selected ? 'border-primary bg-primary text-primary-fg' : 'border-line-2',
                      )}
                    >
                      {selected && <Check className="size-3" strokeWidth={3} />}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </Section>

        <Section icon={<Palette className="size-5" />} title="Accent colour" body="Used for buttons, links and highlights across the store.">
          <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Accent colour">
            {ACCENTS.map((a) => {
              const selected = accent === a.value;
              return (
                <button
                  key={a.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setAccent(a.value)}
                  className={cx(
                    'flex items-center gap-2.5 rounded-full border py-2 pr-4 pl-2 text-sm font-medium transition-all',
                    selected ? 'border-primary bg-primary-soft text-primary-soft-fg' : 'border-line text-fg-2 hover:border-line-2 hover:text-fg',
                  )}
                >
                  <span className="flex size-7 items-center justify-center rounded-full text-white shadow-inner" style={{ background: a.swatch }}>
                    {selected && <Check className="size-4" strokeWidth={3} />}
                  </span>
                  {a.label}
                </button>
              );
            })}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-line-2 bg-surface-2 p-4">
            <span className="text-xs font-medium text-muted">Preview:</span>
            <Button className="py-2">Add to cart</Button>
            <Button variant="outline" className="py-2">
              Buy now
            </Button>
            <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary-soft-fg">New arrival</span>
            <a className="text-sm font-semibold text-primary">View all →</a>
          </div>
          <button
            type="button"
            onClick={() => {
              setMode('system');
              setAccent('blue');
            }}
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-fg"
          >
            <RotateCcw className="size-3.5" /> Reset to default appearance
          </button>
        </Section>

        <Section icon={<UserRound className="size-5" />} title="Account" body={customer ? 'Your profile details.' : 'Sign in to see your profile and orders.'}>
          {customer ? (
            <>
              <dl className="grid gap-4 sm:grid-cols-3">
                {[
                  ['Name', customer.name],
                  ['Email', customer.email],
                  ['Phone', customer.phone ?? 'Not added'],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-surface-2 px-4 py-3">
                    <dt className="text-xs text-muted">{k}</dt>
                    <dd className="mt-0.5 truncate text-sm font-medium text-fg">{v}</dd>
                  </div>
                ))}
              </dl>
              <Link href="/orders" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary-hover">
                <Package className="size-4" /> View my orders
              </Link>
            </>
          ) : (
            <div className="flex flex-wrap gap-3">
              <Link href="/login?next=/settings" className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-fg hover:bg-primary-hover">
                Sign in
              </Link>
              <Link href="/register" className="rounded-xl px-4 py-2.5 text-sm font-semibold text-fg ring-1 ring-line-2 hover:bg-surface-2">
                Create account
              </Link>
            </div>
          )}
        </Section>
      </div>
    </AccountLayout>
  );
}
