import { prisma } from "./src/lib/prisma.js";

async function run() {
  const login = "3d17e4ae";
  const pass = "97aab87c";
  const base64 = Buffer.from(`${login}:${pass}`).toString("base64");
  
  const credentials = {
    base64Token: base64,
    domain: "vivare.stays.net"
  };

  const { StaysNetAdapter } = await import("./src/adapters/crm/staysnet.adapter.js");
  const adapter = new StaysNetAdapter(credentials);
  
  try {
    console.log("Buscando Reserva Completa HV03J");
    const reservationRes = await adapter.getReservation("HV03J");
    
    console.log("Reservation Result:");
    if (!reservationRes.ok) {
       console.log("HTTP Erro Status code: ", reservationRes.error.statusCode);
       console.log(reservationRes.error.message);
    } else {
       console.log("RESERVA ENCONTRADA!");
       console.log(JSON.stringify(reservationRes.value, null, 2));
    }
  } catch(e) {
    console.error("Error manual:", e);
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());

