import { redirect } from "next/navigation";

/** La ruta quedó unificada en «Gastos operativos»; enlaces antiguos siguen funcionando. */
export default function RegistrarGastoRedirectPage() {
  redirect("/dashboard/trabajador/gastos");
}
