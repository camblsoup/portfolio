import { m } from "./paraglide/messages.js";

function App() {
  return <p>{m.example_message({ username: "World" })}</p>;
}

export default App;
