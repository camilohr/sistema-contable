interface Props {
  titulo: string;
  mensaje: string;
  textoConfirmar?: string;
  enProceso?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}

export default function ConfirmModal({
  titulo,
  mensaje,
  textoConfirmar = "Confirmar",
  enProceso = false,
  onConfirmar,
  onCancelar,
}: Props) {
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>{titulo}</h3>
        <p className="count-hint">{mensaje}</p>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancelar} disabled={enProceso}>
            Cancelar
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirmar} disabled={enProceso}>
            {enProceso ? "Procesando..." : textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
