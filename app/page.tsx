import type { Metadata } from "next";
import { ExplorerApp } from "./explorer-app";

export const metadata: Metadata = {
  title: "WorldExplorer — Chaque rue compte",
  description:
    "Explorez votre ville, dévoilez la carte et collectionnez ses histoires.",
};

export default function Home() {
  return <ExplorerApp />;
}
