import { useState } from 'react';
import { Link } from 'react-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { categorySchema, type CategoryDto, type CategoryInput } from '@/shared';
import { useCategories, useDeleteCategory, useSaveCategory } from '@/features/catalog/hooks';
import { useCan } from '@/features/auth/hooks';
import { errorMessage } from '@/lib/api';
import { formatNumber } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { Thumb } from '@/components/catalog/Thumb';
import { ImageUpload } from '@/components/catalog/ImageUpload';

function CategoryDialog({ category, open, onClose }: { category: CategoryDto | null; open: boolean; onClose: () => void }) {
  const save = useSaveCategory();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, control, formState } = useForm<CategoryInput>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: category?.name ?? '', imageUrl: category?.imageUrl ?? null },
  });

  const onSubmit = handleSubmit((input) => {
    setError(null);
    save.mutate(
      { id: category?.id, input },
      {
        onSuccess: ({ category: c, productsMoved }) => {
          toast.success(category ? `${c.name} updated` : `${c.name} added`, {
            description: productsMoved ? `${formatNumber(productsMoved)} product(s) moved to the new name.` : undefined,
          });
          onClose();
        },
        onError: (e) => setError(errorMessage(e)),
      },
    );
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={category ? 'Edit Category' : 'Add Category'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="category-form" loading={save.isPending}>
            {category ? 'Update Category' : 'Save Category'}
          </Button>
        </>
      }
    >
      <form id="category-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field
          label="Category Name *"
          error={formState.errors.name?.message}
          hint={category && category.productCount > 0 ? `Renaming also updates its ${formatNumber(category.productCount)} product(s).` : undefined}
        >
          <Input autoFocus placeholder="e.g. Electronics" invalid={!!formState.errors.name} {...register('name')} />
        </Field>
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-slate-700">Image</span>
          <Controller
            control={control}
            name="imageUrl"
            render={({ field }) => <ImageUpload compact value={field.value ?? null} onChange={field.onChange} />}
          />
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </form>
    </Dialog>
  );
}

export function CategoriesPage() {
  const canWrite = useCan('products:write');
  const categories = useCategories();
  const remove = useDeleteCategory();
  const [editing, setEditing] = useState<CategoryDto | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toDelete, setToDelete] = useState<CategoryDto | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const rows = categories.data ?? [];

  const openDialog = (c: CategoryDto | null) => {
    setEditing(c);
    setDialogOpen(true);
  };

  return (
    <div>
      <PageHeader
        title="Categories"
        breadcrumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Categories' }]}
        actions={
          canWrite && (
            <Button onClick={() => openDialog(null)}>
              <Plus className="h-4 w-4" /> Add Category
            </Button>
          )
        }
      />
      <Card>
        {categories.isPending ? (
          <TableSkeleton rows={6} cols={5} />
        ) : categories.isError ? (
          <ErrorState error={categories.error} onRetry={() => categories.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Tags className="h-6 w-6" />}
            title="No categories yet"
            description="Categories group your products in the admin and the storefront."
            action={
              canWrite ? (
                <Button onClick={() => openDialog(null)}>
                  <Plus className="h-4 w-4" /> Add Category
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Name</TH>
                <TH>Image</TH>
                <TH>Products</TH>
                <TH>Status</TH>
                {canWrite && <TH className="text-right">Actions</TH>}
              </TR>
            </THead>
            <TBody>
              {rows.map((c) => (
                <TR key={c.id}>
                  <TD className="font-medium text-slate-800">{c.name}</TD>
                  <TD>
                    <Thumb src={c.imageUrl} alt={c.name} />
                  </TD>
                  <TD>
                    <Link to={`/products?category=${encodeURIComponent(c.name)}`} className="text-slate-700 hover:text-blue-600">
                      {formatNumber(c.productCount)}
                    </Link>
                  </TD>
                  <TD>
                    {c.activeProductCount > 0 ? (
                      <Badge tone="green">Active</Badge>
                    ) : c.productCount > 0 ? (
                      <Badge tone="amber">No active products</Badge>
                    ) : (
                      <Badge>Empty</Badge>
                    )}
                  </TD>
                  {canWrite && (
                    <TD>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openDialog(c)}
                          className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-blue-600"
                          aria-label={`Edit ${c.name}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setDeleteError(null);
                            setToDelete(c);
                          }}
                          className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-red-100 bg-red-50 text-red-600 hover:bg-red-100"
                          aria-label={`Delete ${c.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {dialogOpen && <CategoryDialog key={editing?.id ?? 'new'} category={editing} open onClose={() => setDialogOpen(false)} />}
      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        loading={remove.isPending}
        error={deleteError}
        title="Delete category?"
        description={
          toDelete && toDelete.productCount > 0 ? (
            <p>
              <span className="font-medium text-slate-900">{toDelete.name}</span> still has {formatNumber(toDelete.productCount)} product(s). Move
              them to another category first, then delete it.
            </p>
          ) : (
            <p>
              <span className="font-medium text-slate-900">{toDelete?.name}</span> will be removed.
            </p>
          )
        }
        onConfirm={() =>
          toDelete &&
          remove.mutate(toDelete.id, {
            onSuccess: () => {
              toast.success(`${toDelete.name} deleted`);
              setToDelete(null);
            },
            onError: (e) => setDeleteError(errorMessage(e)),
          })
        }
      />
    </div>
  );
}
