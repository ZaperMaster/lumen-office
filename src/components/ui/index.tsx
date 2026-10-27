import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { DropdownMenu, Popover as RPopover, Tooltip as RTooltip, Dialog as RDialog, Switch as RSwitch, Slider as RSlider } from "radix-ui";
import { clsx } from "clsx";
import { Check, ChevronRight, X } from "lucide-react";

export const cn = clsx;

/* ------------------------------------------------------------------ */
/*  Botones                                                            */
/* ------------------------------------------------------------------ */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg hover:brightness-110 shadow-sm",
  secondary: "bg-surface-2 text-text hover:bg-surface-3",
  ghost: "text-text hover:bg-surface-2",
  outline: "border border-border bg-surface text-text hover:bg-surface-2",
  danger: "bg-red-600 text-white hover:bg-red-500",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[var(--radius)] font-medium transition-all select-none",
        "disabled:opacity-45 disabled:pointer-events-none",
        size === "sm" && "h-7 px-2.5 text-[12.5px]",
        size === "md" && "h-9 px-3.5 text-[13.5px]",
        size === "lg" && "h-11 px-5 text-[15px]",
        variants[variant],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  shortcut?: string;
  active?: boolean;
  size?: "sm" | "md";
}

/** Botón cuadrado con icono y tooltip; se usa en barras de herramientas. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, shortcut, active, size = "md", className, children, ...rest },
  ref,
) {
  return (
    <Tooltip label={label} shortcut={shortcut}>
      <button
        ref={ref}
        aria-label={label}
        aria-pressed={active}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-md transition-colors",
          size === "md" ? "h-8 w-8" : "h-7 w-7",
          active ? "bg-accent-soft text-accent" : "text-text hover:bg-surface-2",
          "disabled:opacity-35 disabled:pointer-events-none",
          className,
        )}
        {...rest}
      >
        {children}
      </button>
    </Tooltip>
  );
});

/* ------------------------------------------------------------------ */
/*  Tooltip                                                            */
/* ------------------------------------------------------------------ */

export const TooltipProvider = ({ children }: { children: ReactNode }) => (
  <RTooltip.Provider delayDuration={450} skipDelayDuration={200}>
    {children}
  </RTooltip.Provider>
);

export function Tooltip({ label, shortcut, children, side = "bottom" }: { label: ReactNode; shortcut?: string; children: ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <RTooltip.Root>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content
          side={side}
          sideOffset={6}
          className="z-[100] animate-pop-in rounded-md bg-[#1d1e24] px-2 py-1 text-[12px] text-white shadow-lg"
        >
          {label}
          {shortcut && <span className="ml-2 text-white/55">{shortcut}</span>}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}

/* ------------------------------------------------------------------ */
/*  Menús desplegables                                                 */
/* ------------------------------------------------------------------ */

const menuContent =
  "z-[90] min-w-[200px] animate-pop-in rounded-[var(--radius)] border border-border bg-surface p-1 text-text shadow-soft";
const menuItem =
  "relative flex h-8 cursor-default select-none items-center gap-2.5 rounded-md px-2.5 text-[13px] outline-none data-[highlighted]:bg-surface-2 data-[disabled]:opacity-40";

export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;

export function MenuContent({ children, align = "start", className, ...rest }: DropdownMenu.DropdownMenuContentProps) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content align={align} sideOffset={6} className={cn(menuContent, className)} {...rest}>
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  );
}

export function MenuItem({
  icon,
  shortcut,
  children,
  danger,
  className,
  ...rest
}: DropdownMenu.DropdownMenuItemProps & { icon?: ReactNode; shortcut?: string; danger?: boolean }) {
  return (
    <DropdownMenu.Item className={cn(menuItem, danger && "text-red-500", className)} {...rest}>
      {icon && <span className="flex w-4 justify-center text-muted [&>svg]:size-4">{icon}</span>}
      <span className="flex-1">{children}</span>
      {shortcut && <span className="text-[11.5px] text-muted">{shortcut}</span>}
    </DropdownMenu.Item>
  );
}

export function MenuCheckItem({ checked, children, ...rest }: DropdownMenu.DropdownMenuCheckboxItemProps) {
  return (
    <DropdownMenu.CheckboxItem checked={checked} className={menuItem} {...rest}>
      <span className="flex w-4 justify-center">{checked && <Check className="size-4 text-accent" />}</span>
      <span className="flex-1">{children}</span>
    </DropdownMenu.CheckboxItem>
  );
}

export const MenuSeparator = () => <DropdownMenu.Separator className="my-1 h-px bg-border" />;
export const MenuLabel = ({ children }: { children: ReactNode }) => (
  <DropdownMenu.Label className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">
    {children}
  </DropdownMenu.Label>
);

export function SubMenu({ label, icon, children }: { label: ReactNode; icon?: ReactNode; children: ReactNode }) {
  return (
    <DropdownMenu.Sub>
      <DropdownMenu.SubTrigger className={cn(menuItem, "data-[state=open]:bg-surface-2")}>
        {icon && <span className="flex w-4 justify-center text-muted [&>svg]:size-4">{icon}</span>}
        <span className="flex-1">{label}</span>
        <ChevronRight className="size-3.5 text-muted" />
      </DropdownMenu.SubTrigger>
      <DropdownMenu.Portal>
        <DropdownMenu.SubContent sideOffset={4} className={menuContent}>
          {children}
        </DropdownMenu.SubContent>
      </DropdownMenu.Portal>
    </DropdownMenu.Sub>
  );
}

/* ------------------------------------------------------------------ */
/*  Popover                                                            */
/* ------------------------------------------------------------------ */

export const Popover = RPopover.Root;
export const PopoverTrigger = RPopover.Trigger;
export const PopoverClose = RPopover.Close;

export function PopoverContent({ children, className, align = "start", ...rest }: RPopover.PopoverContentProps) {
  return (
    <RPopover.Portal>
      <RPopover.Content
        align={align}
        sideOffset={6}
        className={cn("z-[90] animate-pop-in rounded-[var(--radius)] border border-border bg-surface p-3 text-text shadow-soft", className)}
        {...rest}
      >
        {children}
      </RPopover.Content>
    </RPopover.Portal>
  );
}

/* ------------------------------------------------------------------ */
/*  Diálogo                                                            */
/* ------------------------------------------------------------------ */

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  footer,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
}) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-[2px] animate-fade-in" />
        <RDialog.Content
          className={cn(
            "fixed top-1/2 left-1/2 z-[81] flex max-h-[88vh] w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 flex-col",
            "rounded-[calc(var(--radius)+4px)] border border-border bg-surface text-text shadow-2xl animate-pop-in",
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <RDialog.Title className="text-[16px] font-semibold">{title}</RDialog.Title>
              {description ? (
                <RDialog.Description className="mt-0.5 text-[13px] text-muted">{description}</RDialog.Description>
              ) : (
                <RDialog.Description className="sr-only">{title}</RDialog.Description>
              )}
            </div>
            <RDialog.Close className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-text" aria-label="Cerrar">
              <X className="size-4" />
            </RDialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

/* ------------------------------------------------------------------ */
/*  Formularios                                                        */
/* ------------------------------------------------------------------ */

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-9 w-full rounded-[var(--radius)] border border-border bg-surface px-3 text-[13.5px] text-text outline-none",
        "placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent-soft",
        className,
      )}
      {...rest}
    />
  );
});

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <RSwitch.Root
      checked={checked}
      onCheckedChange={onChange}
      aria-label={label}
      className="relative h-5 w-9 shrink-0 rounded-full bg-surface-3 transition-colors data-[state=checked]:bg-accent"
    >
      <RSwitch.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
    </RSwitch.Root>
  );
}

export function Slider({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  label?: string;
  className?: string;
}) {
  return (
    <RSlider.Root
      value={[value]}
      min={min}
      max={max}
      step={step}
      onValueChange={(v) => onChange(v[0])}
      aria-label={label}
      className={cn("relative flex h-5 w-full touch-none items-center select-none", className)}
    >
      <RSlider.Track className="relative h-1 grow rounded-full bg-surface-3">
        <RSlider.Range className="absolute h-full rounded-full bg-accent" />
      </RSlider.Track>
      <RSlider.Thumb className="block size-3.5 rounded-full border-2 border-accent bg-surface shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft" />
    </RSlider.Root>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; title?: string }[];
  className?: string;
}) {
  return (
    <div className={cn("inline-flex rounded-[var(--radius)] bg-surface-2 p-0.5", className)} role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-[calc(var(--radius)-2px)] px-3 text-[12.5px] font-medium transition-all",
            value === o.value ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-muted">{children}</kbd>
  );
}

export function Separator({ vertical, className }: { vertical?: boolean; className?: string }) {
  return <div className={cn(vertical ? "mx-1 h-6 w-px" : "my-2 h-px w-full", "bg-border", className)} />;
}
