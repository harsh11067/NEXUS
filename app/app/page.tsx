import { redirect } from "next/navigation";

// The single frontend is the cinematic NEXUS world. Root enters the World district.
export default function Home() {
  redirect("/d/NEXUS%20World.dc.html");
}
