import "./styles/globals.css";
import NeuralSynapseHero from "@/components/ui/neurons-hero";
import Counsel from "./components/Counsel";

export default function App() {
  const go = () => document.getElementById("counsel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  return (
    <div className="bg-bg text-fg">
      <NeuralSynapseHero onCta={go} />
      <div id="counsel"><Counsel /></div>
    </div>
  );
}
