import type { Product, Location } from '@/types';
import { formatCurrency } from '@/lib/format';
import { taxRateForProduct } from '@/lib/tax';
import { publicAssetUrl } from '@/lib/publicAssetUrl';
import { Package, GripVertical, Euro } from 'lucide-react';

interface Props {
  product: Product;
  location: Location;
  onAdd: (product: Product) => void;
  disabled?: boolean;
  dragMode?: boolean;
  onDragStart?: (id: string) => void;
  onDragOver?: (id: string) => void;
  onDrop?: () => void;
  isDraggedOver?: boolean;
  isDragging?: boolean;
}

export function ProductTile({
  product, location, onAdd, disabled,
  dragMode, onDragStart, onDragOver, onDrop,
  isDraggedOver, isDragging,
}: Props) {
  const isDisabled = !product.available || disabled;
  const price = product.prices[location];
  const pfand = product.pfand[location];

  const tileClasses = `group relative flex min-h-[10rem] min-w-0 flex-col overflow-hidden rounded-xl border bg-white text-left shadow-sm transition-all dark:bg-gray-800 ${
    isDraggedOver
      ? 'border-blue-500 ring-2 ring-blue-400/50'
      : 'border-gray-200 hover:border-gray-300 hover:shadow-md dark:border-gray-700 dark:hover:border-gray-600'
  } ${isDragging ? 'opacity-40' : ''} ${dragMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer active:scale-[0.97]'} ${isDisabled && !dragMode ? 'cursor-not-allowed opacity-40' : ''}`;

  const inner = (
    <>
      <div className="relative flex h-24 items-center justify-center overflow-hidden bg-gray-50 dark:bg-gray-700/50 lg:h-28">
        {product.imageUrl ? (
          <img src={publicAssetUrl(product.imageUrl)} alt={product.name} className="h-full w-full object-cover" draggable={false} />
        ) : (
          <Package className="h-10 w-10 text-gray-300 dark:text-gray-500" />
        )}
        <span className="absolute right-1.5 top-1.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-white">
          {taxRateForProduct(product, location)}%
        </span>
        {product.hasShot && (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-blue-600/90 px-1.5 py-0.5 text-[9px] font-bold text-white">
            Schuss
          </span>
        )}
        {product.hasIndividualPrice && (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-amber-500/90 px-1.5 py-0.5 text-[9px] font-bold text-white">
            <Euro className="inline h-2.5 w-2.5" /> Variabel
          </span>
        )}
        {product.isPfandArticle && (
          <span className="absolute bottom-1.5 left-1.5 rounded-full bg-teal-600/90 px-1.5 py-0.5 text-[9px] font-bold text-white">
            Pfand
          </span>
        )}
        {dragMode && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
            <GripVertical className="h-7 w-7 text-white" />
          </div>
        )}
      </div>
      <div className="flex flex-col items-center gap-1 px-2 py-2.5 text-center">
        <span className="line-clamp-2 break-words text-sm font-semibold leading-tight text-gray-900 dark:text-gray-100">{product.name}</span>
        <div className="flex flex-col items-center">
          {product.hasIndividualPrice ? (
            <span className="text-sm font-bold text-amber-500 dark:text-amber-400">Preis individuell</span>
          ) : (
            <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{formatCurrency(price)}</span>
          )}
          {pfand > 0 && (
            <span className="text-[9px] font-medium text-gray-400">+ {formatCurrency(pfand)} Pfand</span>
          )}
        </div>
      </div>
    </>
  );

  if (dragMode) {
    return (
      <div
        draggable
        onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart?.(product.id); }}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; onDragOver?.(product.id); }}
        onDrop={(e) => { e.preventDefault(); onDrop?.(); }}
        className={tileClasses}
      >
        {inner}
      </div>
    );
  }

  return (
    <button
      onClick={() => onAdd(product)}
      disabled={isDisabled}
      className={tileClasses}
    >
      {inner}
    </button>
  );
}
