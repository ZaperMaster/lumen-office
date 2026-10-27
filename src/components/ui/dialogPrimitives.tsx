import type { ReactNode } from "react";
import { Dialog as RDialog } from "radix-ui";
import { X } from "lucide-react";

/** Diálogo sin cabecera, para ventanas con su propia estructura (p. ej. Configuración). */
export function RDialogRoot({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-[80] animate-fade-in bg-black/40 backdrop-blur-[2px]" />
        <RDialog.Content className="fixed top-1/2 left-1/2 z-[81] -translate-x-1/2 -translate-y-1/2 animate-pop-in overflow-hidden rounded-[calc(var(--radius)+6px)] border border-border bg-surface text-text shadow-2xl">
          <RDialog.Title className="sr-only">{title}</RDialog.Title>
          <RDialog.Description className="sr-only">{title}</RDialog.Description>
          {children}
          <RDialog.Close className="absolute top-3 right-3 rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text" aria-label="Cerrar">
            <X className="size-4" />
          </RDialog.Close>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
