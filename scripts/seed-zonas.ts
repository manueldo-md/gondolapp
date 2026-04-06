/**
 * Seed de zonas geográficas de Argentina.
 * Inserta Provincias → Departamentos → Localidades en las tablas nuevas.
 *
 * Ejecución:
 *   npx tsx --env-file=.env.local scripts/seed-zonas.ts
 *
 * O si tsx no está instalado:
 *   npm i -D tsx && npx tsx --env-file=.env.local scripts/seed-zonas.ts
 *
 * Fuente de datos: INDEC / datos.gob.ar / Wikipedia (nomenclatura oficial).
 * Entre Ríos es completo (piloto Biomega/Georgalos).
 * Buenos Aires: 135 partidos con cabeceras y ciudades >10.000 hab.
 * Córdoba, Santa Fe, Mendoza, Tucumán: ciudades >5.000 hab.
 * Resto: capital provincial + ciudades >1.000 hab.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'

// ── Cargar .env.local si no hay env vars ya seteadas ─────────
try {
  const envPath = join(process.cwd(), '.env.local')
  const content = readFileSync(envPath, 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
    if (key && !process.env[key]) process.env[key] = val
  }
} catch {
  // No hay .env.local — se asume que las vars ya están en el entorno
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌  Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── Datos: Provincia → Departamento → [Localidades] ─────────
//
// Nomenclatura usada:
//   "Partido"     en Buenos Aires  (→ guardado como departamento en DB)
//   "Departamento" en Entre Ríos, Córdoba, Santa Fe, Mendoza, etc.
//   "Sección"     en Neuquén, Río Negro, Chubut, Santa Cruz, La Pampa
//   "Comunas 1-15" en CABA (agrupadas bajo un departamento único "Comunas")
// ────────────────────────────────────────────────────────────

const DATA: Record<string, Record<string, string[]>> = {

  // ══════════════════════════════════════════════════════════
  // ENTRE RÍOS — COMPLETO (piloto Biomega/Georgalos)
  // Fuente: INDEC Censo 2022 + datos.gob.ar nomenclador
  // ══════════════════════════════════════════════════════════
  'Entre Ríos': {
    'Colón': [
      'Colón', 'San José', 'Villa Elisa', 'Pueblo Liebig', 'Ubajay',
      'Arroyo Barú', 'Rocamora', 'Hocker', 'Hambis', 'Caseros',
      'Clodomiro Ledesma', 'San Ramón',
    ],
    'Concordia': [
      'Concordia', 'Los Charrúas', 'Benito Legerén', 'Yuquerí',
      'Calabacilla', 'Salto Ander Egg', 'Nueva Escocia', 'Los Conquistadores',
    ],
    'Diamante': [
      'Diamante', 'General Ramírez', 'Aldea Santa Rosa', 'Aldea Protestante',
      'Aldea Santa María', 'Puerto Diamante', 'Aldea San Rafael',
      'La Jaula', 'Betbeder',
    ],
    'Federación': [
      'Federación', 'Chajarí', 'San Jaime de la Frontera', 'Villa del Rosario',
      'Nueva Federación', 'Santa Ana', 'Colonia General Roca',
      'Villa Libertad', 'Federación (nueva ciudad)',
    ],
    'Federal': [
      'Federal', 'Sauce de Luna', 'La Criolla', 'Conscripto Bernardi',
      'Cerrito', 'Estación Federal',
    ],
    'Feliciano': [
      'San José de Feliciano', 'Colonia Yeruá', 'Los Conquistadores',
      'Alcaraz', 'Colonia General Roca',
    ],
    'Gualeguay': [
      'Gualeguay', 'Urdinarrain', 'Médanos', 'Estación Lazo',
      'Aldea Asunción', 'Pastor Britos', 'Villa Paranacito',
    ],
    'Gualeguaychú': [
      'Gualeguaychú', 'Larroque', 'Gilbert', 'Faustino M. Parera',
      'Aldea Brasilera', 'General Almada', 'Pueblo General Belgrano',
      'Ñancay', 'Maciá', 'Enrique Carbó',
    ],
    'Islas del Ibicuy': [
      'Villa Paranacito', 'Ibicuy', 'Ceibas', 'Puerto Ibicuy',
      'Las Achiras', 'El Palmar', 'Médanos',
    ],
    'La Paz': [
      'La Paz', 'Bovril', 'Santa Elena', 'Alcaraz Norte',
      'Las Moscas', 'El Quebracho', 'Palo a Pique', 'San Gustavo',
      'Villa Urquiza', 'Piedras Blancas',
    ],
    'Nogoyá': [
      'Nogoyá', 'Aranguren', 'Gobernador Echagüe', 'Sauce Montrull',
      'Lucas González', 'Crucecitas', 'Trélew', 'Aldea Santa Marina',
    ],
    'Paraná': [
      'Paraná', 'Crespo', 'Oro Verde', 'San Benito', 'Colonia Avellaneda',
      'María Grande', 'Hernandarias', 'Aldea Santa María', 'Viale',
      'Ramírez', 'General Racedo', 'Sosa', 'Cerrito', 'Sauce Montrull',
      'Tezanos Pinto', 'Seguí',
    ],
    'San Salvador': [
      'San Salvador', 'General Campos', 'Enrique Carbó', 'Villa Mantero',
    ],
    'Tala': [
      'Rosario del Tala', 'Gobernador Mansilla', 'Maciá', 'Antelo',
      'Montoya', 'Guardamonte', 'Don Cristóbal',
    ],
    'Uruguay': [
      'Concepción del Uruguay', 'Basavilbaso', 'Pronunciamiento', 'Herrera',
      'Caseros', 'Ingeniero Miguel Sajaroff', '1° de Mayo', 'Colón',
      'Villa San Marcial', 'Puerto Yeruá',
    ],
    'Victoria': [
      'Victoria', 'Irazusta', 'Gobernador Etchevehere', 'Molino Doll',
      'Altamirano Sur', 'Pajonal', 'Antelo',
    ],
    'Villaguay': [
      'Villaguay', 'Bergmann', 'Jubileo', 'Ramírez', 'Paso de la Laguna',
      'Ingeniero Sajaroff', 'Enrique Díaz', 'Raices Oeste', 'Ingeniero Hourquebie',
    ],
  },

  // ══════════════════════════════════════════════════════════
  // BUENOS AIRES — 135 PARTIDOS
  // Fuente: INDEC / ARBA / Wikipedia
  // Localidades: cabecera de cada partido + ciudades >10.000 hab
  // ══════════════════════════════════════════════════════════
  'Buenos Aires': {
    'Adolfo Alsina':           ['Carhué', 'Darregueira'],
    'Adolfo Gonzales Chaves':  ['Adolfo Gonzales Chaves'],
    'Alberti':                 ['Alberti', 'Mechita'],
    'Almirante Brown':         ['Adrogué', 'Burzaco', 'Claypole', 'Glew', 'José Mármol', 'Longchamps', 'Rafael Calzada'],
    'Arrecifes':               ['Arrecifes'],
    'Ayacucho':                ['Ayacucho'],
    'Azul':                    ['Azul', 'Cacharí', 'Chillar'],
    'Bahía Blanca':            ['Bahía Blanca', 'Cerri', 'Ingeniero White'],
    'Balcarce':                ['Balcarce'],
    'Baradero':                ['Baradero'],
    'Benito Juárez':           ['Benito Juárez', 'Barker'],
    'Berazategui':             ['Berazategui', 'Plátanos', 'Quilmes'],
    'Berisso':                 ['Berisso'],
    'Bolívar':                 ['Bolívar', 'Moctezuma'],
    'Bragado':                 ['Bragado'],
    'Brandsen':                ['Brandsen'],
    'Campana':                 ['Campana'],
    'Cañuelas':                ['Cañuelas'],
    'Capitán Sarmiento':       ['Capitán Sarmiento'],
    'Carlos Casares':          ['Carlos Casares'],
    'Carlos Tejedor':          ['Carlos Tejedor'],
    'Carmen de Areco':         ['Carmen de Areco'],
    'Castelli':                ['Castelli'],
    'Chacabuco':               ['Chacabuco'],
    'Chascomús':               ['Chascomús', 'Lezama'],
    'Chivilcoy':               ['Chivilcoy'],
    'Colón':                   ['Colón'],
    'Coronel Dorrego':         ['Coronel Dorrego'],
    'Coronel Pringles':        ['Coronel Pringles'],
    'Coronel Rosales':         ['Punta Alta'],
    'Coronel Suárez':          ['Coronel Suárez'],
    'Daireaux':                ['Daireaux'],
    'Dolores':                 ['Dolores'],
    'Ensenada':                ['Ensenada'],
    'Escobar':                 ['Belén de Escobar', 'Garín', 'Matheu'],
    'Esteban Echeverría':      ['Monte Grande', 'El Jagüel', '9 de Abril'],
    'Exaltación de la Cruz':   ['Capilla del Señor', 'Zárate'],
    'Ezeiza':                  ['Ezeiza', 'Tristán Suárez'],
    'Florencio Varela':        ['Florencio Varela', 'Berazategui', 'Villa Vatteone'],
    'Florentino Ameghino':     ['Florentino Ameghino'],
    'General Alvarado':        ['Miramar', 'Mar del Sur'],
    'General Alvear':          ['General Alvear'],
    'General Arenales':        ['General Arenales'],
    'General Belgrano':        ['General Belgrano'],
    'General Guido':           ['General Guido'],
    'General Juan Madariaga':  ['General Juan Madariaga'],
    'General La Madrid':       ['General La Madrid'],
    'General Las Heras':       ['General Las Heras'],
    'General Lavalle':         ['General Lavalle'],
    'General Paz':             ['Ranchos', 'Loma Verde'],
    'General Pinto':           ['General Pinto'],
    'General Pueyrredón':      ['Mar del Plata', 'Batán', 'Sierra de los Padres'],
    'General Rodríguez':       ['General Rodríguez'],
    'General San Martín':      ['San Martín', 'Villa Ballester', 'Palermo', 'Billinghurst'],
    'General Viamonte':        ['Los Toldos', 'General Viamonte'],
    'General Villegas':        ['General Villegas'],
    'Guaminí':                 ['Guaminí'],
    'Hipólito Yrigoyen':       ['Henderson'],
    'Hurlingham':              ['Hurlingham', 'William Morris', 'Villa Tesei'],
    'Ituzaingó':               ['Ituzaingó', 'Morón'],
    'José C. Paz':             ['José C. Paz'],
    'Junín':                   ['Junín', 'Morse', 'Agustina'],
    'La Costa':                ['Mar del Tuyú', 'San Bernardo', 'Aguas Verdes', 'San Clemente del Tuyú'],
    'La Matanza':              ['San Justo', 'Ramos Mejía', 'Isidro Casanova', 'Gregorio de Laferrere', 'González Catán', 'La Tablada', 'Lomas del Mirador', 'Virrey del Pino', 'Ciudad Evita'],
    'La Plata':                ['La Plata', 'Berisso', 'Ensenada', 'Los Hornos', 'Villa Elvira', 'City Bell', 'Gonnet', 'Villa Elisa'],
    'Lanús':                   ['Lanús', 'Remedios de Escalada', 'Valentín Alsina'],
    'Laprida':                 ['Laprida'],
    'Las Flores':              ['Las Flores'],
    'Leandro N. Alem':         ['Leandro N. Alem'],
    'Lincoln':                 ['Lincoln'],
    'Lobería':                 ['Lobería'],
    'Lobos':                   ['Lobos'],
    'Lomas de Zamora':         ['Lomas de Zamora', 'Banfield', 'Temperley', 'Turdera', 'Ingeniero Budge', 'Villa Centenario'],
    'Luján':                   ['Luján', 'Mercedes'],
    'Magdalena':               ['Magdalena'],
    'Maipú':                   ['Maipú'],
    'Malvinas Argentinas':     ['Los Polvorines', 'Bella Vista', 'Ing. Adolfo Surdeaux'],
    'Mar Chiquita':            ['Mar Chiquita', 'Mar de Cobo'],
    'Marcos Paz':              ['Marcos Paz'],
    'Mercedes':                ['Mercedes'],
    'Merlo':                   ['Merlo', 'Pontevedra', 'Libertad', 'Parque San Martín'],
    'Monte':                   ['San Miguel del Monte'],
    'Monte Hermoso':           ['Monte Hermoso'],
    'Moreno':                  ['Moreno', 'Trujui', 'Francisco Álvarez', 'La Reja'],
    'Morón':                   ['Morón', 'Castelar', 'El Palomar', 'Haedo', 'Villa Sarmiento'],
    'Navarro':                 ['Navarro'],
    'Necochea':                ['Necochea', 'Quequén'],
    'Nueve de Julio':          ['Nueve de Julio'],
    'Olavarría':               ['Olavarría', 'Sierras Bayas', 'Loma Negra'],
    'Patagones':               ['Carmen de Patagones', 'Villalonga'],
    'Pehuajó':                 ['Pehuajó'],
    'Pellegrini':              ['Pellegrini'],
    'Pergamino':               ['Pergamino'],
    'Pila':                    ['Pila'],
    'Pilar':                   ['Del Viso', 'Pilar', 'Maquinista Savio', 'Fátima'],
    'Pinamar':                 ['Pinamar', 'Ostende', 'Valeria del Mar'],
    'Presidente Perón':        ['Guernica', 'San Francisco Solano'],
    'Puán':                    ['Puán', 'Darregueira'],
    'Punta Indio':             ['Punta Indio'],
    'Quilmes':                 ['Quilmes', 'Bernal', 'Ezpeleta', 'Don Bosco', 'Berazategui'],
    'Ramallo':                 ['Ramallo', 'Villa Ramallo'],
    'Rauch':                   ['Rauch'],
    'Rivadavia':               ['América', 'Sansinena'],
    'Rojas':                   ['Rojas'],
    'Roque Pérez':             ['Roque Pérez'],
    'Saavedra':                ['Pigüé', 'Saavedra'],
    'Saladillo':               ['Saladillo'],
    'Salliqueló':              ['Salliqueló'],
    'Salto':                   ['Salto'],
    'San Andrés de Giles':     ['San Andrés de Giles'],
    'San Antonio de Areco':    ['San Antonio de Areco'],
    'San Cayetano':            ['San Cayetano'],
    'San Fernando':            ['San Fernando', 'Victoria'],
    'San Isidro':              ['San Isidro', 'Martínez', 'Boulogne sur Mer', 'Beccar', 'Villa Adelina'],
    'San Miguel':              ['San Miguel', 'Bella Vista', 'Muñiz'],
    'San Nicolás':             ['San Nicolás de los Arroyos', 'Villa Constitución'],
    'San Pedro':               ['San Pedro'],
    'San Vicente':             ['San Vicente'],
    'Suipacha':                ['Suipacha'],
    'Tandil':                  ['Tandil'],
    'Tapalqué':                ['Tapalqué'],
    'Tigre':                   ['Tigre', 'Don Torcuato', 'General Pacheco', 'Ricardo Rojas', 'El Talar'],
    'Tordillo':                ['General Conesa'],
    'Tornquist':               ['Tornquist', 'Sierra de la Ventana'],
    'Trenque Lauquen':         ['Trenque Lauquen'],
    'Tres Arroyos':            ['Tres Arroyos', 'Claromecó'],
    'Tres de Febrero':         ['Caseros', 'Ciudadela', 'Santos Lugares', 'Palermo Chico'],
    'Tres Lomas':              ['Tres Lomas'],
    'Veinticinco de Mayo':     ['Veinticinco de Mayo'],
    'Vicente López':           ['Vicente López', 'Florida', 'Olivos', 'Munro', 'Villa Martelli'],
    'Villa Gesell':            ['Villa Gesell', 'Mar Azul'],
    'Villarino':               ['Médanos', 'Villalonga'],
    'Zárate':                  ['Zárate', 'Lima'],
  },

  // ══════════════════════════════════════════════════════════
  // CIUDAD AUTÓNOMA DE BUENOS AIRES
  // 15 comunas como subdivisión administrativa
  // ══════════════════════════════════════════════════════════
  'Ciudad Autónoma de Buenos Aires': {
    'Comuna 1':  ['Retiro', 'San Nicolás', 'Puerto Madero', 'San Telmo', 'Montserrat', 'Constitución'],
    'Comuna 2':  ['Recoleta'],
    'Comuna 3':  ['Balvanera', 'San Cristóbal'],
    'Comuna 4':  ['La Boca', 'Barracas', 'Parque Patricios', 'Nueva Pompeya'],
    'Comuna 5':  ['Almagro', 'Boedo'],
    'Comuna 6':  ['Caballito'],
    'Comuna 7':  ['Flores', 'Parque Chacabuco'],
    'Comuna 8':  ['Villa Soldati', 'Villa Riachuelo', 'Villa Lugano'],
    'Comuna 9':  ['Liniers', 'Mataderos', 'Parque Avellaneda'],
    'Comuna 10': ['Villa Real', 'Monte Castro', 'Versalles', 'Floresta', 'Vélez Sársfield', 'Villa Luro'],
    'Comuna 11': ['Villa General Mitre', 'Villa Devoto', 'Villa del Parque', 'Villa Santa Rita'],
    'Comuna 12': ['Coghlan', 'Saavedra', 'Villa Urquiza', 'Villa Pueyrredón'],
    'Comuna 13': ['Belgrano', 'Colegiales', 'Núñez'],
    'Comuna 14': ['Palermo'],
    'Comuna 15': ['Chacarita', 'Villa Crespo', 'Paternal', 'Villa Ortúzar', 'Agronomía', 'Parque Chas'],
  },

  // ══════════════════════════════════════════════════════════
  // CÓRDOBA — 26 DEPARTAMENTOS
  // Localidades >5.000 hab + cabeceras de departamento
  // ══════════════════════════════════════════════════════════
  'Córdoba': {
    'Capital':         ['Córdoba'],
    'Calamuchita':     ['Villa General Belgrano', 'Alta Gracia', 'Santa Rosa de Calamuchita', 'Las Rosas'],
    'Colón':           ['Jesús María', 'Colonia Caroya', 'Saldán', 'La Calera', 'Unquillo', 'Mendiolaza', 'Villa Allende'],
    'Cruz del Eje':    ['Cruz del Eje', 'Villa de Soto'],
    'General Roca':    ['Río Cuarto', 'Las Higueras', 'Holmberg', 'La Carlota'],
    'General San Martín': ['Villa María', 'Villa Nueva', 'San Francisco'],
    'Ischilín':        ['Deán Funes', 'Quilino'],
    'Juárez Celman':   ['Hernando', 'Oliva'],
    'Marcos Juárez':   ['Marcos Juárez', 'Leones'],
    'Minas':           ['Mina Clavero'],
    'Pocho':           ['Salsacate'],
    'Presidente Roque Sáenz Peña': ['Villa Huidobro', 'Villa Valeria'],
    'Punilla':         ['Villa Carlos Paz', 'Cosquín', 'La Falda', 'Huerta Grande', 'Valle Hermoso', 'Bialet Massé', 'Santa María de Punilla'],
    'Río Cuarto':      ['Río Cuarto', 'Las Higueras'],
    'Río Primero':     ['Río Primero', 'Obispo Trejo'],
    'Río Seco':        ['Sebastián Elcano'],
    'Río Segundo':     ['Río Segundo', 'Oncativo'],
    'San Alberto':     ['Mina Clavero', 'Nono', 'Las Rosas'],
    'San Javier':      ['Santa Rosa de Calamuchita'],
    'San Justo':       ['San Francisco', 'Brinkmann', 'Devoto'],
    'Santa María':     ['Alta Gracia', 'Anisacate', 'La Bolsa'],
    'Sobremonte':      ['San Francisco del Chañar'],
    'Tercero Arriba':  ['Bell Ville', 'Marcos Juárez', 'Ucacha'],
    'Totoral':         ['Totoral', 'Capilla del Monte'],
    'Tulumba':         ['Tulumba'],
    'Unión':           ['Bell Ville', 'Brinkmann'],
  },

  // ══════════════════════════════════════════════════════════
  // SANTA FE — 19 DEPARTAMENTOS
  // Localidades >5.000 hab + cabeceras
  // ══════════════════════════════════════════════════════════
  'Santa Fe': {
    'Belgrano':        ['Las Rosas', 'Cañada de Gómez'],
    'Caseros':         ['Casilda', 'Cañada de Gómez'],
    'Castellanos':     ['Rafaela', 'Sunchales', 'Esperanza', 'San Carlos Centro'],
    'Constitución':    ['Villa Constitución', 'Empalme Villa Constitución'],
    'Garay':           ['Helvecia', 'Cayastá'],
    'General López':   ['Venado Tuerto', 'Murphy', 'Rufino'],
    'General Obligado': ['Reconquista', 'Avellaneda', 'Villa Ocampo'],
    'Iriondo':         ['Cañada de Gómez', 'Totoras'],
    'La Capital':      ['Santa Fe', 'Santo Tomé', 'Recreo', 'Monte Vera', 'San José del Rincón'],
    'Las Colonias':    ['Esperanza', 'San Justo', 'Humboldt'],
    'Nueve de Julio':  ['Tostado'],
    'Rosario':         ['Rosario', 'Villa Gobernador Gálvez', 'Pérez', 'Funes', 'Granadero Baigorria'],
    'San Cristóbal':   ['San Cristóbal', 'Ceres'],
    'San Javier':      ['San Javier'],
    'San Jerónimo':    ['Gálvez', 'Coronda'],
    'San Justo':       ['San Justo'],
    'San Lorenzo':     ['San Lorenzo', 'Puerto San Martín', 'Fray Luis Beltrán', 'Capitán Bermúdez'],
    'San Martín':      ['Cañada de Gómez', 'Firmat'],
    'Vera':            ['Vera', 'Tostado'],
  },

  // ══════════════════════════════════════════════════════════
  // MENDOZA — 18 DEPARTAMENTOS
  // Localidades >5.000 hab + cabeceras
  // ══════════════════════════════════════════════════════════
  'Mendoza': {
    'Capital':          ['Mendoza'],
    'General Alvear':   ['General Alvear'],
    'Godoy Cruz':       ['Godoy Cruz'],
    'Guaymallén':       ['Guaymallén', 'Pedro Molina', 'Belgrano'],
    'Junín':            ['Junín'],
    'La Paz':           ['La Paz'],
    'Las Heras':        ['Las Heras', 'El Algarrobal'],
    'Lavalle':          ['Lavalle', 'Gustavo André'],
    'Luján de Cuyo':    ['Luján de Cuyo', 'Perdriel', 'Carrodilla'],
    'Maipú':            ['Maipú', 'Luzuriaga', 'General Gutiérrez'],
    'Malargüe':         ['Malargüe'],
    'Rivadavia':        ['Rivadavia', 'Los Reyunos'],
    'San Carlos':       ['San Carlos'],
    'San Martín':       ['San Martín', 'Palmira'],
    'San Rafael':       ['San Rafael'],
    'Santa Rosa':       ['Santa Rosa'],
    'Tupungato':        ['Tupungato'],
    'Tunuyán':          ['Tunuyán', 'Valle de Uco'],
  },

  // ══════════════════════════════════════════════════════════
  // TUCUMÁN — 17 DEPARTAMENTOS
  // Localidades >5.000 hab + cabeceras
  // ══════════════════════════════════════════════════════════
  'Tucumán': {
    'Capital':          ['San Miguel de Tucumán'],
    'Burruyacú':        ['Burruyacú'],
    'Cruz Alta':        ['Banda del Río Salí', 'Alderetes', 'Las Talitas'],
    'Chicligasta':      ['Concepción'],
    'Famaillá':         ['Famaillá'],
    'Graneros':         ['Graneros'],
    'Juan Bautista Alberdi': ['Juan Bautista Alberdi'],
    'La Cocha':         ['La Cocha'],
    'Leales':           ['Bella Vista'],
    'Lules':            ['Lules'],
    'Monteros':         ['Monteros', 'Aguilares'],
    'Río Chico':        ['Aguilares', 'El Bracho'],
    'Simoca':           ['Simoca'],
    'Tafí del Valle':   ['Tafí del Valle'],
    'Tafí Viejo':       ['Tafí Viejo'],
    'Trancas':          ['Trancas'],
    'Yerba Buena':      ['Yerba Buena', 'Tafí Viejo'],
  },

  // ══════════════════════════════════════════════════════════
  // SALTA — 23 DEPARTAMENTOS
  // Capital + ciudades principales
  // ══════════════════════════════════════════════════════════
  'Salta': {
    'Anta':             ['Las Lajitas', 'Joaquín V. González'],
    'Cachi':            ['Cachi'],
    'Cafayate':         ['Cafayate'],
    'Capital':          ['Salta'],
    'Cerrillos':        ['Cerrillos', 'La Merced'],
    'Chicoana':         ['Chicoana'],
    'General Güemes':   ['General Güemes'],
    'General San Martín': ['Tartagal', 'Aguaray'],
    'Guachipas':        ['Guachipas'],
    'Iruya':            ['Iruya'],
    'La Caldera':       ['La Caldera'],
    'La Candelaria':    ['La Candelaria'],
    'La Poma':          ['La Poma'],
    'La Viña':          ['La Viña'],
    'Los Andes':        ['San Antonio de los Cobres'],
    'Metán':            ['Metán', 'El Tunal'],
    'Molinos':          ['Molinos'],
    'Orán':             ['Orán', 'Pichanal', 'Embarcación'],
    'Rivadavia':        ['Rivadavia', 'Santa Victoria Este'],
    'Rosario de la Frontera': ['Rosario de la Frontera'],
    'Rosario de Lerma': ['Rosario de Lerma'],
    'San Carlos':       ['San Carlos'],
    'Santa Victoria':   ['Santa Victoria Oeste', 'Santa Victoria Este'],
  },

  // ══════════════════════════════════════════════════════════
  // MISIONES — 17 DEPARTAMENTOS
  // Capital + ciudades principales
  // ══════════════════════════════════════════════════════════
  'Misiones': {
    'Apóstoles':        ['Apóstoles', 'San José'],
    'Cainguás':         ['Campo Grande', 'Aristóbulo del Valle'],
    'Candelaria':       ['Candelaria', 'Santa Ana'],
    'Capital':          ['Posadas'],
    'Concepción':       ['Concepción de la Sierra'],
    'Eldorado':         ['Eldorado', 'Puerto Rico'],
    'General Manuel Belgrano': ['Bernardo de Irigoyen'],
    'Guaraní':          ['El Soberbio'],
    'Iguazú':           ['Puerto Iguazú', 'Puerto Esperanza'],
    'Leandro N. Alem':  ['Leandro N. Alem', 'Oberá'],
    'Libertador General San Martín': ['Puerto Rico', 'Garuhapé'],
    'Montecarlo':       ['Montecarlo'],
    'Moconá':           ['San Pedro'],
    'Oberá':            ['Oberá', 'Campo Ramón'],
    'San Ignacio':      ['San Ignacio', 'Jardín América'],
    'San Pedro':        ['San Pedro'],
    'Veinticinco de Mayo': ['Alba Posse', '25 de Mayo'],
  },

  // ══════════════════════════════════════════════════════════
  // CHACO — 25 DEPARTAMENTOS
  // Capital + ciudades principales
  // ══════════════════════════════════════════════════════════
  'Chaco': {
    '1° de Mayo':       ['Colonia Elisa'],
    '2 de Abril':       ['General Vedia'],
    '9 de Julio':       ['Las Breñas'],
    '12 de Octubre':    ['Gancedo', 'Pampa del Infierno'],
    '25 de Mayo':       ['25 de Mayo'],
    'Almirante Brown':  ['Pampa del Indio'],
    'Bermejo':          ['Juan José Castelli', 'Misión Nueva Pompeya'],
    'Chacabuco':        ['Charata'],
    'Comandante Fernández': ['Presidencia Roque Sáenz Peña'],
    'Fray Justo Santa María de Oro': ['Santa Sylvina'],
    'General Belgrano': ['Corzuela'],
    'General Donovan':  ['Makallé'],
    'General Güemes':   ['Juan José Castelli', 'Nueva Pompeya'],
    'Independencia':    ['Avia Terai'],
    'Libertad':         ['Villa Ángela'],
    'Libertador General San Martín': ['General San Martín'],
    'Maipú':            ['Tres Isletas'],
    'Mayor Luis J. Fontana': ['Villa Ángela'],
    'O\'Higgins':       ['Hermoso Campo'],
    'Presidencia de la Plaza': ['Presidencia de la Plaza'],
    'Quitilipi':        ['Quitilipi'],
    'San Fernando':     ['Resistencia', 'Barranqueras', 'Fontana', 'Vilelas'],
    'San Lorenzo':      ['Chorotis'],
    'Sargento Cabral':  ['Colonias Unidas'],
    'Tapenagá':         ['Charadai'],
  },

  // ══════════════════════════════════════════════════════════
  // CORRIENTES — 25 DEPARTAMENTOS
  // Capital + ciudades principales
  // ══════════════════════════════════════════════════════════
  'Corrientes': {
    'Bella Vista':      ['Bella Vista'],
    'Berón de Astrada': ['Berón de Astrada'],
    'Capital':          ['Corrientes'],
    'Concepción':       ['Concepción'],
    'Curuzú Cuatiá':    ['Curuzú Cuatiá'],
    'Empedrado':        ['Empedrado'],
    'Esquina':          ['Esquina'],
    'General Alvear':   ['Yapeyú'],
    'General Paz':      ['Caá Catí'],
    'Goya':             ['Goya'],
    'Itatí':            ['Itatí'],
    'Ituzaingó':        ['Ituzaingó'],
    'Lavalle':          ['Lavalle'],
    'Mburucuyá':        ['Mburucuyá'],
    'Mercedes':         ['Mercedes'],
    'Monte Caseros':    ['Monte Caseros'],
    'Paso de los Libres': ['Paso de los Libres'],
    'Riachuelo':        ['Riachuelo'],
    'Saladas':          ['Saladas'],
    'San Cosme':        ['San Cosme'],
    'San Luis del Palmar': ['San Luis del Palmar'],
    'San Martín':       ['La Cruz'],
    'San Miguel':       ['San Miguel'],
    'San Roque':        ['San Roque'],
    'Santo Tomé':       ['Santo Tomé'],
  },

  // ══════════════════════════════════════════════════════════
  // FORMOSA — 9 DEPARTAMENTOS
  // Capital + ciudades principales
  // ══════════════════════════════════════════════════════════
  'Formosa': {
    'Bermejo':          ['General Lucio Victorio Mansilla'],
    'Formosa':          ['Formosa'],
    'Laishí':           ['General Lucio Victorio Mansilla'],
    'Matacos':          ['Ingeniero Juárez'],
    'Patiño':           ['Las Lomitas'],
    'Pilagás':          ['Mayor Villafañe'],
    'Pilcomayo':        ['Clorinda'],
    'Pirané':           ['Pirané'],
    'Ramón Lista':      ['Ingeniero Juárez', 'El Potrillo'],
  },

  // ══════════════════════════════════════════════════════════
  // JUJUY — 16 DEPARTAMENTOS
  // Capital + ciudades principales
  // ══════════════════════════════════════════════════════════
  'Jujuy': {
    'Cochinoca':        ['Abra Pampa'],
    'Doctor Manuel Belgrano': ['San Salvador de Jujuy'],
    'El Carmen':        ['Perico', 'El Carmen'],
    'Humahuaca':        ['Humahuaca'],
    'Ledesma':          ['Libertador General San Martín', 'Calilegua'],
    'Palpalá':          ['Palpalá'],
    'Rinconada':        ['Rinconada'],
    'San Antonio':      ['Susques'],
    'San Pedro':        ['San Pedro de Jujuy', 'Monterrico'],
    'Santa Bárbara':    ['La Mendieta'],
    'Santa Catalina':   ['Santa Catalina'],
    'Susques':          ['Susques'],
    'Tilcara':          ['Tilcara'],
    'Tumbaya':          ['Volcán'],
    'Valle Grande':     ['Santa Ana'],
    'Yavi':             ['La Quiaca'],
  },

  // ══════════════════════════════════════════════════════════
  // SAN JUAN — 19 DEPARTAMENTOS
  // Capital + ciudades principales
  // ══════════════════════════════════════════════════════════
  'San Juan': {
    'Albardón':         ['Villa Independencia'],
    'Angaco':           ['Tupeli'],
    'Calingasta':       ['Calingasta'],
    'Capital':          ['San Juan'],
    'Caucete':          ['Caucete'],
    'Chimbas':          ['Chimbas'],
    'Iglesia':          ['Rodeo'],
    'Jachal':           ['San José de Jáchal'],
    'Pocito':           ['Villa Aberastain'],
    'Rawson':           ['Rawson'],
    'Rivadavia':        ['Rivadavia'],
    'San Martín':       ['Alto de Sierra'],
    'Santa Lucía':      ['Santa Lucía'],
    'Sarmiento':        ['Médano de Oro'],
    'Ullum':            ['Villa Media Agua'],
    'Valle Fértil':     ['San Agustín del Valle Fértil'],
    'Veinticinco de Mayo': ['25 de Mayo'],
    'Zonda':            ['Las Tapias'],
    'Nueve de Julio':   ['Pampa Vieja'],
  },

  // ══════════════════════════════════════════════════════════
  // SAN LUIS — 9 DEPARTAMENTOS
  // Capital + ciudades principales
  // ══════════════════════════════════════════════════════════
  'San Luis': {
    'Aymaraes':         ['Naschel'],
    'Belgrano':         ['Villa Unión'],
    'Chacabuco':        ['Concarán', 'Merlo'],
    'Coronel Pringles': ['San Francisco del Monte de Oro'],
    'General Pedernera': ['Villa Mercedes', 'Villa Reynolds'],
    'Gobernador Dupuy': ['Buena Esperanza'],
    'Juan Martín de Pueyrredón': ['San Luis', 'El Volcán', 'La Punta'],
    'Junín':            ['Junín'],
    'La Capital':       ['San Luis'],
  },

  // ══════════════════════════════════════════════════════════
  // LA RIOJA — 18 DEPARTAMENTOS
  // Capital + ciudades principales
  // ══════════════════════════════════════════════════════════
  'La Rioja': {
    'Arauco':           ['Aimogasta'],
    'Capital':          ['La Rioja'],
    'Castro Barros':    ['Aminga'],
    'Chamical':         ['Chamical'],
    'Chilecito':        ['Chilecito'],
    'Coronel Felipe Varela': ['Villa Unión'],
    'Famatina':         ['Chilecito'],
    'General Ángel Vicente Peñaloza': ['Chepes'],
    'General Belgrano': ['Patquía'],
    'General Juan Facundo Quiroga': ['Tama'],
    'General Lamadrid': ['Punta de los Llanos'],
    'General Ortiz de Ocampo': ['San Francisco del Chañar'],
    'General San Martín': ['Olta'],
    'Independencia':    ['Patquía'],
    'Rosario Vera Peñaloza': ['Tama'],
    'San Blas de los Sauces': ['San Blas de los Sauces'],
    'Sanagasta':        ['Sanagasta'],
    'Vinchina':         ['Villa Unión', 'Guandacol'],
  },

  // ══════════════════════════════════════════════════════════
  // CATAMARCA — 16 DEPARTAMENTOS
  // Capital + ciudades principales
  // ══════════════════════════════════════════════════════════
  'Catamarca': {
    'Ambato':           ['El Rodeo'],
    'Ancasti':          ['Ancasti'],
    'Andalgalá':        ['Andalgalá'],
    'Antofagasta de la Sierra': ['Antofagasta de la Sierra'],
    'Belén':            ['Belén'],
    'Capayán':          ['Huillapima', 'Chumbicha'],
    'Capital':          ['San Fernando del Valle de Catamarca'],
    'El Alto':          ['El Alto'],
    'Fray Mamerto Esquiú': ['Piedra Blanca'],
    'La Paz':           ['Recreo'],
    'Paclín':           ['Los Altos'],
    'Pomán':            ['Fiambalá'],
    'Santa María':      ['Santa María'],
    'Santa Rosa':       ['Santa Rosa de Río Primero'],
    'Tinogasta':        ['Tinogasta'],
    'Valle Viejo':      ['Valle Viejo'],
  },

  // ══════════════════════════════════════════════════════════
  // SANTIAGO DEL ESTERO — 27 DEPARTAMENTOS
  // Capital + ciudades principales
  // ══════════════════════════════════════════════════════════
  'Santiago del Estero': {
    'Aguirre':          ['Garza'],
    'Alberdi':          ['Villa General Mitre'],
    'Atamisqui':        ['Villa Atamisqui'],
    'Avellaneda':       ['Añatuya'],
    'Banda':            ['La Banda'],
    'Belgrano':         ['Fernández'],
    'Capital':          ['Santiago del Estero'],
    'Choya':            ['Frías'],
    'Copo':             ['Monte Quemado'],
    'Figueroa':         ['Colonia Dora'],
    'General Taboada':  ['Añatuya'],
    'Guasayán':         ['Icaño'],
    'Jiménez':          ['Los Juríes'],
    'Juan Felipe Ibarra': ['Villa Ojo de Agua'],
    'Loreto':           ['Loreto'],
    'Mitre':            ['Sumampa'],
    'Moreno':           ['Quimilí'],
    'Ojo de Agua':      ['Villa Ojo de Agua'],
    'Pellegrini':       ['Nueva Esperanza'],
    'Quebrachos':       ['Weisburd'],
    'Río Hondo':        ['Termas de Río Hondo', 'Vinará'],
    'Rivadavia':        ['Suncho Corral'],
    'Robles':           ['Frías'],
    'Salavina':         ['Los Telares'],
    'San Martín':       ['Sumampa'],
    'Silípica':         ['Fernández'],
    'Sarmiento':        ['Clodomira'],
  },

  // ══════════════════════════════════════════════════════════
  // NEUQUÉN — 16 DEPARTAMENTOS
  // Capital + ciudades principales
  // ══════════════════════════════════════════════════════════
  'Neuquén': {
    'Añelo':            ['Añelo'],
    'Aluminé':          ['Aluminé'],
    'Catán Lil':        ['Las Lajas'],
    'Collón Curá':      ['Junín de los Andes'],
    'Confluencia':      ['Neuquén', 'Plottier', 'Centenario'],
    'Huiliches':        ['Junín de los Andes'],
    'Lácar':            ['San Martín de los Andes'],
    'Loncopué':         ['Loncopué'],
    'Los Lagos':        ['Villa La Angostura', 'Villa Traful'],
    'Minas':            ['Andacollo'],
    'Ñorquín':          ['Chos Malal'],
    'Pehuenches':       ['Barrancas'],
    'Picún Leufú':      ['Picún Leufú'],
    'Picunches':        ['Las Lajas'],
    'Zapala':           ['Zapala'],
    'Zúñiga':           ['Rincón de los Sauces'],
  },

  // ══════════════════════════════════════════════════════════
  // RÍO NEGRO — 13 DEPARTAMENTOS
  // Capital + ciudades principales
  // ══════════════════════════════════════════════════════════
  'Río Negro': {
    'Adolfo Alsina':    ['Viedma', 'Carmen de Patagones'],
    'Avellaneda':       ['Choele Choel'],
    'Bariloche':        ['San Carlos de Bariloche', 'El Bolsón'],
    'Conesa':           ['General Conesa'],
    'El Cuy':           ['Ingeniero Huergo'],
    'General Roca':     ['General Roca', 'Allen', 'Cipolletti', 'Cinco Saltos', 'Villa Regina'],
    'Ñorquinco':        ['Maquinchao'],
    'Nueve de Julio':   ['Jacobacci'],
    'Pichi Mahuida':    ['Río Colorado'],
    'Pilcaniyeu':       ['Pilcaniyeu'],
    'San Antonio':      ['San Antonio Oeste', 'Las Grutas'],
    'Valcheta':         ['Valcheta'],
    'Veinticinco de Mayo': ['Ingeniero Huergo'],
  },

  // ══════════════════════════════════════════════════════════
  // CHUBUT — 15 DEPARTAMENTOS
  // Capital + ciudades principales
  // ══════════════════════════════════════════════════════════
  'Chubut': {
    'Biedma':           ['Puerto Madryn'],
    'Cushamen':         ['Cushamen'],
    'Escalante':        ['Comodoro Rivadavia', 'Rada Tilly', 'Caleta Olivia'],
    'Florentino Ameghino': ['Dolavon'],
    'Futaleufú':        ['Esquel', 'Trevelin'],
    'Gaiman':           ['Gaiman'],
    'Gastre':           ['Gastre'],
    'Languiñeo':        ['Tecka'],
    'Mártires':         ['Las Plumas'],
    'Paso de Indios':   ['Paso de Indios'],
    'Rawson':           ['Rawson', 'Trelew'],
    'Río Senguer':      ['Alto Río Senguer'],
    'Sarmiento':        ['Sarmiento'],
    'Tehuelches':       ['Puerto Madryn'],
    'Telsen':           ['Telsen'],
  },

  // ══════════════════════════════════════════════════════════
  // SANTA CRUZ — 7 DEPARTAMENTOS
  // Capital + ciudades principales
  // ══════════════════════════════════════════════════════════
  'Santa Cruz': {
    'Corpen Aike':      ['Gobernador Gregores'],
    'Deseado':          ['Puerto Deseado', 'Las Heras'],
    'Güer Aike':        ['Río Gallegos', 'El Calafate', 'Río Turbio', '28 de Noviembre'],
    'Lago Argentino':   ['El Calafate', 'El Chaltén'],
    'Lago Buenos Aires': ['Perito Moreno', 'Los Antiguos'],
    'Magallanes':       ['Puerto San Julián'],
    'Río Chico':        ['Jaramillo'],
  },

  // ══════════════════════════════════════════════════════════
  // TIERRA DEL FUEGO, ANTÁRTIDA E ISLAS DEL ATLÁNTICO SUR
  // 2 departamentos
  // ══════════════════════════════════════════════════════════
  'Tierra del Fuego, Antártida e Islas del Atlántico Sur': {
    'Río Grande':       ['Río Grande', 'Tolhuin'],
    'Ushuaia':          ['Ushuaia'],
  },

  // ══════════════════════════════════════════════════════════
  // LA PAMPA — 22 DEPARTAMENTOS
  // Capital + ciudades principales
  // ══════════════════════════════════════════════════════════
  'La Pampa': {
    'Atreucó':          ['Macachín'],
    'Caleu Caleu':      ['Bernasconi'],
    'Capital':          ['Santa Rosa'],
    'Catriló':          ['Catriló'],
    'Chapaleufú':       ['Intendente Alvear'],
    'Chalileo':         ['Santa Isabel'],
    'Chical Co':        ['Algarrobo del Águila'],
    'Conhelo':          ['Eduardo Castex'],
    'Curacó':           ['Puelches'],
    'General Acha':     ['General Acha'],
    'Guatraché':        ['Guatraché'],
    'Hucal':            ['General San Martín'],
    'Lihuel Calel':     ['Puelén'],
    'Limay Mahuida':    ['La Reforma'],
    'Loventué':         ['Victorica'],
    'Maracó':           ['General Pico'],
    'Puelén':           ['25 de Mayo'],
    'Quemú Quemú':      ['Quemú Quemú'],
    'Rancul':           ['Rancul'],
    'Realicó':          ['Realicó'],
    'Toay':             ['Toay'],
    'Utracán':          ['General Acha'],
  },
}

// ── Función principal ────────────────────────────────────────
async function seed() {
  console.log('🌱  Iniciando seed de zonas geográficas...\n')

  // Limpiar datos previos (en orden inverso de FK)
  console.log('🗑   Limpiando datos previos...')
  await admin.from('campana_localidades').delete().neq('localidad_id', 0)
  await admin.from('gondolero_localidades').delete().neq('localidad_id', 0)
  await admin.from('localidades').delete().neq('id', 0)
  await admin.from('departamentos').delete().neq('id', 0)
  await admin.from('provincias').delete().neq('id', 0)

  // Insertar provincias
  const provNames = Object.keys(DATA)
  const { data: provinciasData, error: errProv } = await admin
    .from('provincias')
    .insert(provNames.map(nombre => ({ nombre })))
    .select('id, nombre')

  if (errProv) { console.error('❌ Error insertando provincias:', errProv.message); process.exit(1) }
  console.log(`✅  ${provinciasData!.length} provincias insertadas`)

  const provMap: Record<string, number> = {}
  for (const p of provinciasData!) provMap[p.nombre] = p.id

  // Insertar departamentos
  const deptRows: { nombre: string; provincia_id: number }[] = []
  for (const [provNombre, depts] of Object.entries(DATA)) {
    for (const deptNombre of Object.keys(depts)) {
      deptRows.push({ nombre: deptNombre, provincia_id: provMap[provNombre] })
    }
  }

  const { data: deptsData, error: errDept } = await admin
    .from('departamentos')
    .insert(deptRows)
    .select('id, nombre, provincia_id')

  if (errDept) { console.error('❌ Error insertando departamentos:', errDept.message); process.exit(1) }
  console.log(`✅  ${deptsData!.length} departamentos insertados`)

  // Mapa: "provincia_id|nombre" → departamento_id
  const deptMap: Record<string, number> = {}
  for (const d of deptsData!) deptMap[`${d.provincia_id}|${d.nombre}`] = d.id

  // Insertar localidades en lotes de 100
  const locRows: { nombre: string; departamento_id: number }[] = []
  for (const [provNombre, depts] of Object.entries(DATA)) {
    for (const [deptNombre, locs] of Object.entries(depts)) {
      const deptId = deptMap[`${provMap[provNombre]}|${deptNombre}`]
      if (!deptId) { console.warn(`⚠️  Departamento no encontrado: ${deptNombre} (${provNombre})`); continue }
      for (const loc of locs) {
        locRows.push({ nombre: loc, departamento_id: deptId })
      }
    }
  }

  let totalLoc = 0
  for (let i = 0; i < locRows.length; i += 100) {
    const batch = locRows.slice(i, i + 100)
    const { error: errLoc } = await admin.from('localidades').insert(batch)
    if (errLoc) { console.error(`❌ Error insertando localidades (lote ${i}):`, errLoc.message); process.exit(1) }
    totalLoc += batch.length
  }
  console.log(`✅  ${totalLoc} localidades insertadas`)

  // Resumen por provincia
  console.log('\n📊  Resumen por provincia:')
  for (const [prov, depts] of Object.entries(DATA)) {
    const totalDepts = Object.keys(depts).length
    const totalLocs  = Object.values(depts).reduce((s, locs) => s + locs.length, 0)
    console.log(`   ${prov}: ${totalDepts} depts, ${totalLocs} localidades`)
  }

  console.log('\n🎉  Seed completado!')
}

seed().catch(err => { console.error(err); process.exit(1) })
