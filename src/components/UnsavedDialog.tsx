import { AlertTriangle } from "lucide-react";
import { useConfirm } from "@/store/confirm";
import { Button, Dialog } from "@/components/ui";

/** «¿Guardar los cambios?» al salir de un documento o cerrar la ventana, como en Word. */
export function UnsavedDialog() {
  const { open, files, answer } = useConfirm();
  const single = files.length === 1;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && answer("cancel")}
      title={single ? "¿Guardar los cambios?" : `¿Guardar los cambios en ${files.length} archivos?`}
      className="w-[min(92vw,460px)]"
      footer={
        <>
          <Button variant="ghost" onClick={() => answer("cancel")}>
            Cancelar
          </Button>
          <Button onClick={() => answer("discard")}>No guardar</Button>
          <Button variant="primary" autoFocus onClick={() => answer("save")}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex gap-3 text-[13.5px] leading-relaxed">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-500" />
        <div>
          {single ? (
            <p>
              Hay cambios que no se han guardado en <b>«{files[0]}»</b>.
            </p>
          ) : (
            <>
              <p className="mb-1.5">Estos archivos tienen cambios sin guardar:</p>
              <ul className="list-disc pl-5">
                {files.map((f) => (
                  <li key={f}>
                    <b>{f}</b>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="mt-2 text-[12.5px] text-muted">
            Si eliges «No guardar», el archivo del disco se queda como estaba. Los cambios siguen dentro de Lumen.
          </p>
        </div>
      </div>
    </Dialog>
  );
}
