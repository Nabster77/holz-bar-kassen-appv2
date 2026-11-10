import { useState } from 'react';
import type { CartItem, Transaction, PaymentMethod, Location } from '@/types';
import { calcNet, calcTax, formatCurrency } from '@/lib/format';
import { taxRateForClass } from '@/lib/tax';
import { X, Check, Receipt, Banknote, CreditCard, Coins, Recycle, AlertTriangle } from 'lucide-react';

interface Props {
  items: CartItem[];
  location: Location;
  onComplete: (tx: Transaction) => void;
  onCancel: () => void;
}

export function CheckoutModal({ items, location, onComplete, onCancel }: Props) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [givenAmount, setGivenAmount] = useState('');
  const [paid, setPaid] = useState(false);
  const [confirmBooking, setConfirmBooking] = useState(false);

  const grossByRate = new Map<number, number>();
  let totalPfand = 0, pfandRetoure = 0;
  for (const item of items) {
    if (item.isPfandRetoure) {
      pfandRetoure += item.unitPrice * item.quantity;
      continue;
    }
    const rate = taxRateForClass(item.product.taxClass, location);
    const gross = item.unitPrice * item.quantity;
    grossByRate.set(rate, (grossByRate.get(rate) ?? 0) + gross);
    totalPfand += item.unitPfand * item.quantity;
  }
  const subtotal = [...grossByRate.values()].reduce((s, v) => s + v, 0);
  const total = subtotal + totalPfand + pfandRetoure;
  const totalTax = [...grossByRate.entries()].reduce((s, [r, g]) => s + calcTax(g, r), 0);
  const totalNet = [...grossByRate.entries()].reduce((s, [r, g]) => s + calcNet(g, r), 0);

  const given = parseFloat(givenAmount.replace(',', '.')) || 0;
  const change = given - total;
  const isPfandOnly = items.every((item) => item.isPfandRetoure);
  const cashPayment = !isPfandOnly && paymentMethod === 'cash';

  function handleConfirm() {
    const taxByRate: Record<number, number> = {};
    const txItems = items.map((item) => {
      if (item.isPfandRetoure) {
        return {
          productId: item.product.id,
          name: item.product.name,
          price: item.unitPrice,
          quantity: item.quantity,
          taxRate: 0 as const,
          netPrice: item.unitPrice,
          taxAmount: 0,
          categoryId: item.product.categoryId,
          pfand: item.unitPrice * item.quantity,
          isPfandRetoure: true,
        };
      }
      const rate = taxRateForClass(item.product.taxClass, location);
      const gross = item.unitPrice * item.quantity;
      const net = calcNet(gross, rate);
      const tax = calcTax(gross, rate);
      taxByRate[rate] = (taxByRate[rate] ?? 0) + tax;
      return {
        productId: item.product.id,
        name: item.shot && item.shot.id !== 'none'
          ? `${item.product.name} + ${item.shot.name}`
          : item.product.name,
        price: item.unitPrice,
        quantity: item.quantity,
        taxRate: rate,
        netPrice: net,
        taxAmount: tax,
        categoryId: item.product.categoryId,
        pfand: item.unitPfand * item.quantity,
        shotName: item.shot && item.shot.id !== 'none' ? item.shot.name : undefined,
      };
    });

    const tx: Transaction = {
      id: `tx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      items: txItems,
      subtotal,
      taxByRate,
      totalNet,
      totalTax,
      totalPfand: totalPfand + pfandRetoure,
      total,
      paymentMethod: isPfandOnly ? 'cash' : (paymentMethod ?? 'cash'),
      amountPaid: cashPayment ? given : undefined,
      change: cashPayment ? change : undefined,
      location,
    };
    onComplete(tx);
    setPaid(true);
  }

  if (paid) {
    return (
      <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/50 p-4 sm:items-center" onClick={onCancel}>
        <div className="my-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-sm flex-col items-center gap-4 overflow-y-auto rounded-3xl bg-white p-8 shadow-2xl dark:bg-gray-800" onClick={(e) => e.stopPropagation()}>
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40">
            <Check className="h-12 w-12 text-green-600 dark:text-green-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Bezahlung erfolgreich</h2>
          <p className={`text-3xl font-bold ${total < 0 ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`}>{formatCurrency(total)}</p>
          {paymentMethod === 'cash' && change > 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400">Rückgeld: <span className="font-bold text-green-600 dark:text-green-400">{formatCurrency(change)}</span></p>
          )}
          <button onClick={onCancel} className="w-full rounded-xl bg-blue-600 py-3 text-base font-semibold text-white transition hover:bg-blue-700 active:scale-95">
            Weiter kassieren
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/50 p-4 sm:items-center" onClick={onCancel}>
      <div className="my-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col rounded-3xl bg-white shadow-2xl dark:bg-gray-800" onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 p-4 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Bezahlung</h2>
          </div>
          <button onClick={onCancel} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto space-y-3 p-5">
          <div className="max-h-40 overflow-y-auto space-y-1">
            {items.map((item) => (
              <div key={`${item.product.id}-${item.shot?.id ?? 'none'}-${item.isPfandRetoure ? 'pf' : 'reg'}`} className="flex items-center justify-between text-sm">
                <span className={item.isPfandRetoure ? 'flex items-center gap-1.5 text-teal-600 dark:text-teal-400' : 'text-gray-600 dark:text-gray-400'}>
                  {item.isPfandRetoure && <Recycle className="h-3.5 w-3.5" />}
                  {item.quantity}× {item.shot && item.shot.id !== 'none' ? `${item.product.name} + ${item.shot.name}` : item.product.name}
                </span>
                <span className={`font-medium ${(item.unitPrice + item.unitPfand) * item.quantity < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
                  {formatCurrency((item.unitPrice + item.unitPfand) * item.quantity)}
                </span>
              </div>
            ))}
          </div>
          <div className="space-y-1 border-t border-gray-200 pt-3 text-sm dark:border-gray-700">
            {[...grossByRate.entries()].sort((a, b) => a[0] - b[0]).map(([rate, gross]) => (
              <div key={rate} className="flex justify-between text-gray-500 dark:text-gray-400">
                <span>MwSt {rate}%</span><span>{formatCurrency(calcTax(gross, rate))}</span>
              </div>
            ))}
            {totalPfand > 0 && (
              <div className="flex justify-between text-gray-500 dark:text-gray-400">
                <span>Pfand</span><span>{formatCurrency(totalPfand)}</span>
              </div>
            )}
          </div>
          <div className="flex items-baseline justify-between border-t-2 border-gray-300 pt-3 dark:border-gray-600">
            <span className="text-lg font-bold text-gray-900 dark:text-gray-100">Zu zahlen</span>
            <span className={`text-3xl font-bold ${total < 0 ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`}>{formatCurrency(total)}</span>
          </div>

          {!isPfandOnly && (<>
          {/* Payment method selection */}
          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              onClick={() => setPaymentMethod('cash')}
              className={`flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition active:scale-95 ${
                paymentMethod === 'cash'
                  ? 'bg-green-600 text-white shadow-md'
                  : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'
              }`}
            >
              <Banknote className="h-5 w-5" /> BAR
            </button>
            <button
              onClick={() => setPaymentMethod('card')}
              className={`flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition active:scale-95 ${
                paymentMethod === 'card'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'
              }`}
            >
              <CreditCard className="h-5 w-5" /> KARTE
            </button>
          </div>

          {/* Cash given + change */}
          {paymentMethod === 'cash' && (
            <div className="space-y-2 rounded-xl bg-gray-50 p-3 dark:bg-gray-900/40">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Gegeben (€)</label>
                <input
                  value={givenAmount}
                  onChange={(e) => setGivenAmount(e.target.value)}
                  placeholder={formatCurrency(total)}
                  inputMode="decimal"
                  autoFocus
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-base text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                />
              </div>
              {given > 0 && (
                <div className={`flex flex-col items-center justify-center gap-1 pt-1 text-center ${change < 0 ? 'text-red-600 dark:text-red-400' : change === 0 ? 'text-gray-600 dark:text-gray-400' : 'text-green-600 dark:text-green-400'}`}>
                  <div className="flex items-center gap-1.5 text-sm font-semibold">
                    <Coins className="h-4 w-4" />
                    <span>{change < 0 ? 'Noch offen' : change === 0 ? 'Passend' : 'Rückgeld'}</span>
                  </div>
                  {change !== 0 && (
                    <span className="text-2xl font-bold leading-tight">{formatCurrency(Math.abs(change))}</span>
                  )}
                </div>
              )}
            </div>
          )}

          </>)}
          <button
            onClick={() => setConfirmBooking(true)}
            disabled={!isPfandOnly && (!paymentMethod || (paymentMethod === 'cash' && given < total))}
            className={`sticky bottom-0 w-full rounded-xl py-4 text-lg font-bold text-white shadow-lg transition active:scale-95 disabled:opacity-50 ${isPfandOnly ? 'bg-teal-600 hover:bg-teal-700' : paymentMethod === 'card' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'}`}
          >
            {isPfandOnly ? 'Pfandausgabe' : 'Bezahlen bestätigen'}
          </button>
        </div>
      </div>

      {confirmBooking && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto overscroll-contain bg-black/60 p-4 sm:items-center" onClick={() => setConfirmBooking(false)}>
          <div className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl dark:bg-gray-800" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex flex-col items-center gap-3 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-900/30">
                <AlertTriangle className="h-7 w-7 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{isPfandOnly ? 'Pfandausgabe buchen?' : 'Verkauf buchen?'}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Letzte Bestätigung</p>
              </div>
            </div>
            <div className="mb-4 space-y-1.5 rounded-xl bg-gray-50 p-3 text-sm dark:bg-gray-900/40">
              <div className="flex justify-between text-gray-600 dark:text-gray-400">
                <span>Gesamtbetrag</span>
                <span className={`font-bold ${total < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>{formatCurrency(total)}</span>
              </div>
              {cashPayment && (
                <>
                  <div className="flex justify-between text-gray-600 dark:text-gray-400">
                    <span>Gegeben</span>
                    <span className="font-medium">{formatCurrency(given)}</span>
                  </div>
                  {change > 0 && (
                    <div className="flex justify-between text-green-600 dark:text-green-400">
                      <span>Rückgeld</span>
                      <span className="font-bold">{formatCurrency(change)}</span>
                    </div>
                  )}
                </>
              )}
              <div className="flex justify-between text-gray-600 dark:text-gray-400">
                <span>Zahlungsart</span>
                <span className="font-medium">{isPfandOnly ? 'Pfandausgabe' : paymentMethod === 'cash' ? 'Bar' : 'Karte'}</span>
              </div>
            </div>
            <p className="mb-4 text-center text-sm text-gray-600 dark:text-gray-300">
              Möchten Sie diesen Verkauf wirklich buchen und den Kassenbestand aktualisieren? Nach der Bestätigung ist der Vorgang <strong className="text-gray-900 dark:text-gray-100">nicht mehr abänderbar</strong>.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmBooking(false)}
                className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
              >
                Nein, abbrechen
              </button>
              <button
                onClick={() => { setConfirmBooking(false); handleConfirm(); }}
                className="flex-1 rounded-xl bg-green-600 px-4 py-3 text-sm font-bold text-white shadow-md transition hover:bg-green-700 active:scale-95"
              >
                <Check className="mr-1.5 inline h-4 w-4" /> Ja, buchen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
