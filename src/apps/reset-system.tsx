import { AppComponentProps } from "../kernel/app-registry/structure";

export function ResetSystem({ bridge }: AppComponentProps)
{
  const wipeSystem = async () =>
  {
    await bridge.resetSystem();
    window.location.reload();
  };

  return (
    <div style={{ display: "flex", "flex-direction": "column", "align-items": "center", padding: "10px" }}>
      <h3>WARNING ⚠</h3>
      <p>
        This will reset all of the saved or modified files that you've edited. Are you sure you want
        to reset the system?
      </p>
      <div style={{display: "flex", gap: "10px"}}>
        <button
          type="button"
          class="reset-system-button"
          aria-label="Yes"
          onClick={() => void wipeSystem()}
        >
          Yes! Wipe away my past
        </button>
        <button
          type="button"
          class="reset-system-button"
          aria-label="No"
          onClick={() => bridge.close()}
        >
          No, I want to preserve my changes
        </button>
      </div>
    </div>
  );
}
