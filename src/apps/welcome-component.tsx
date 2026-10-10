// @ts-types="solid-js"
import { createSignal } from "solid-js";

export { WelcomeApp };

function WelcomeApp() {
  const [clickCount, setClickCount] = createSignal<number>(0);

  return (
    <div>
      <p>Count: {clickCount()}</p>
      <button type="button" onClick={() => setClickCount((c) => c + 1)}>
        Click me!
      </button>
    </div>
  );
}
