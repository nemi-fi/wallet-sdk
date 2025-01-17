import "react-toastify/dist/ReactToastify.css";
import { ToastContainer } from "react-toastify";
import * as ReactDOM from "react-dom/client";
import App from "./App";

const root = ReactDOM.createRoot(
	document.getElementById("root") as HTMLElement
);
root.render(
	<>
		<App />
		<ToastContainer />
	</>
);
