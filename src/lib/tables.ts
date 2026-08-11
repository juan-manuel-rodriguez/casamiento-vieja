/**
 * Las mesas del salón. Ya no viven en el código: se cargan desde el admin y se
 * guardan en la pestaña `tables` del Sheet, así Seba y Emi arman su propio
 * salón sin tocar el repo.
 *
 * `number` es lo que se escribe junto a cada invitado, así que renumerar
 * mesas resienta gente en silencio. Para reordenar, conviene borrar y crear.
 */
export type VenueTable = {
  number: number;
  seats: number;
  zone: string;
};

export function totalSeats(tables: readonly VenueTable[]): number {
  return tables.reduce((sum, table) => sum + table.seats, 0);
}

/** Sector y sus mesas, en el orden en que fueron cargadas. */
export function tablesByZone(
  tables: readonly VenueTable[],
): Array<{ zone: string; tables: VenueTable[] }> {
  const zones: Array<{ zone: string; tables: VenueTable[] }> = [];
  for (const table of tables) {
    const current = zones.find((z) => z.zone === table.zone);
    if (current) current.tables.push(table);
    else zones.push({ zone: table.zone, tables: [table] });
  }
  return zones;
}

/** El valor guardado es el número de mesa como texto; "" es sin mesa. */
export function findTable(
  tables: readonly VenueTable[],
  value: string,
): VenueTable | undefined {
  const number = Number(value);
  if (!number) return undefined;
  return tables.find((table) => table.number === number);
}

export function tableLabel(tables: readonly VenueTable[], value: string): string {
  if (!value) return "Sin mesa";
  const table = findTable(tables, value);
  return table ? `Mesa ${table.number} · ${table.seats}` : value;
}

export type TablePlacement = {
  number: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PlanLayout = {
  viewBox: { width: number; height: number };
  placements: TablePlacement[];
  /** Franja de cada sector, para poder rotularlo sobre el plano. */
  zoneBands: Array<{ zone: string; y: number; height: number }>;
};

const COLUMNS = 3;
const CELL_WIDTH = 132;
const CELL_HEIGHT = 112;
const ZONE_LABEL_HEIGHT = 30;
const TABLE_HEIGHT = 38;

/** Las mesas grandes se dibujan más anchas, para que el plano se lea. */
function tableWidth(seats: number): number {
  return seats >= 10 ? 100 : 78;
}

/**
 * Acomoda las mesas solas: una franja por sector y, dentro, una grilla de
 * hasta tres por fila. Nadie tiene que dibujar coordenadas a mano, que era el
 * motivo por el que el plano anterior servía para un solo salón.
 */
export function planLayout(tables: readonly VenueTable[]): PlanLayout {
  const zones = tablesByZone(tables);
  const placements: TablePlacement[] = [];
  const zoneBands: PlanLayout["zoneBands"] = [];
  let y = 0;

  for (const zone of zones) {
    const rows = Math.ceil(zone.tables.length / COLUMNS);
    const bandHeight = ZONE_LABEL_HEIGHT + rows * CELL_HEIGHT;
    zoneBands.push({ zone: zone.zone, y, height: bandHeight });

    zone.tables.forEach((table, index) => {
      const row = Math.floor(index / COLUMNS);
      const column = index % COLUMNS;
      // La última fila incompleta se centra, para que no quede coja.
      const inRow = Math.min(COLUMNS, zone.tables.length - row * COLUMNS);
      const rowWidth = inRow * CELL_WIDTH;
      const rowStart = (COLUMNS * CELL_WIDTH - rowWidth) / 2;
      const width = tableWidth(table.seats);
      placements.push({
        number: table.number,
        x: rowStart + column * CELL_WIDTH + (CELL_WIDTH - width) / 2,
        y: y + ZONE_LABEL_HEIGHT + row * CELL_HEIGHT + (CELL_HEIGHT - TABLE_HEIGHT) / 2,
        width,
        height: TABLE_HEIGHT,
      });
    });

    y += bandHeight;
  }

  return {
    viewBox: { width: COLUMNS * CELL_WIDTH, height: Math.max(y, CELL_HEIGHT) },
    placements,
    zoneBands,
  };
}

/**
 * Sillas alrededor de una mesa: una en cada punta y el resto repartido entre
 * los dos lados largos. Soporta números impares de lugares, porque las mesas
 * ahora las carga el usuario y nada garantiza que sean pares.
 */
export function seatPositions(
  placement: TablePlacement,
  seats: number,
): Array<{ x: number; y: number }> {
  const gap = 11;
  const positions: Array<{ x: number; y: number }> = [];
  const horizontal = placement.width >= placement.height;
  const midX = placement.x + placement.width / 2;
  const midY = placement.y + placement.height / 2;

  if (seats <= 0) return positions;
  if (seats <= 2) {
    // Con una o dos sillas no hay lados largos que repartir: van a las puntas.
    if (horizontal) {
      positions.push({ x: placement.x - gap, y: midY });
      if (seats === 2) positions.push({ x: placement.x + placement.width + gap, y: midY });
    } else {
      positions.push({ x: midX, y: placement.y - gap });
      if (seats === 2) positions.push({ x: midX, y: placement.y + placement.height + gap });
    }
    return positions;
  }

  const sides = seats - 2;
  const first = Math.ceil(sides / 2);
  const second = sides - first;
  const along = horizontal ? placement.width : placement.height;

  const place = (count: number, isFirstSide: boolean) => {
    for (let i = 0; i < count; i++) {
      const offset = (along * (i + 1)) / (count + 1);
      if (horizontal) {
        positions.push({
          x: placement.x + offset,
          y: isFirstSide ? placement.y - gap : placement.y + placement.height + gap,
        });
      } else {
        positions.push({
          x: isFirstSide ? placement.x - gap : placement.x + placement.width + gap,
          y: placement.y + offset,
        });
      }
    }
  };
  place(first, true);
  place(second, false);

  if (horizontal) {
    positions.push({ x: placement.x - gap, y: midY });
    positions.push({ x: placement.x + placement.width + gap, y: midY });
  } else {
    positions.push({ x: midX, y: placement.y - gap });
    positions.push({ x: midX, y: placement.y + placement.height + gap });
  }

  return positions;
}
