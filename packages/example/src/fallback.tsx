import { toast, ToastContent, ToastOptions } from "react-toastify"

interface ConfirmToastProps {
  onConfirm: () => void
  onCancel: () => void
}

const ConfirmToast: React.FC<ConfirmToastProps> = ({ onConfirm, onCancel }) => (
  <div>
    <p>Please confirm the transaction</p>
    <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
      <button
        onClick={onCancel}
        style={{
          background: "red",
          color: "white",
          border: "none",
          padding: "8px 12px",
          cursor: "pointer",
        }}
      >
        Deny
      </button>
      <button
        onClick={onConfirm}
        style={{
          background: "green",
          color: "white",
          border: "none",
          padding: "8px 12px",
          cursor: "pointer",
        }}
      >
        Open Wallet
      </button>
    </div>
  </div>
)

export const fallbackOpenPopup: any = async (openPopup: any) => {
  return new Promise<Window | null>((resolve) => {
    const handleConfirm = () => {
      resolve(openPopup())
      toast.dismiss(toastId)
    }

    const handleCancel = () => {
      resolve(null)
      toast.dismiss(toastId)
    }

    const toastContent: ToastContent = (
      <ConfirmToast onConfirm={handleConfirm} onCancel={handleCancel} />
    )

    const toastOptions: ToastOptions = {
      autoClose: false,
      closeOnClick: false,
      draggable: false,
      // Optional: Customize the toast's appearance
      style: { minWidth: "300px" },
    }

    const toastId = toast(toastContent, toastOptions)
  })
}
