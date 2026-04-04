/**
 * Sistema de alias únicos para gondoleros.
 * Genera un alias del tipo "NarutoVeloz" combinando un personaje + un adjetivo positivo.
 */

// ── 600+ personajes de dibujos animados y anime (90s → hoy) ──────────────────

export const PERSONAJES: string[] = [
  // Dragon Ball / Super / GT
  'Goku', 'Vegeta', 'Gohan', 'Piccolo', 'Krillin', 'Bulma', 'Trunks', 'Goten',
  'Raditz', 'Nappa', 'Broly', 'Bardock', 'Beerus', 'Whis', 'Bulla', 'Uub',
  'Videl', 'Yamcha', 'Tien', 'Chiaotzu', 'Hercule', 'Jiren', 'Hit', 'Caulifla',
  'Kale', 'Cabba', 'Dyspo', 'Toppo', 'Zamasu', 'Turles', 'Cooler',

  // Naruto / Shippuden / Boruto
  'Naruto', 'Sasuke', 'Sakura', 'Kakashi', 'Hinata', 'Neji', 'RockLee', 'Gai',
  'Shikamaru', 'Ino', 'Choji', 'Kiba', 'Shino', 'Gaara', 'Temari', 'Kankuro',
  'Jiraiya', 'Tsunade', 'Orochimaru', 'Itachi', 'Kisame', 'Minato', 'Kushina',
  'Nagato', 'Konan', 'Deidara', 'Sasori', 'Hidan', 'Kakuzu', 'Sai', 'Yamato',
  'Kabuto', 'Madara', 'Obito', 'Boruto', 'Sarada', 'Mitsuki', 'Kawaki',

  // One Piece
  'Luffy', 'Zoro', 'Nami', 'Usopp', 'Sanji', 'Chopper', 'Robin', 'Franky',
  'Brook', 'Shanks', 'Rayleigh', 'Ace', 'Sabo', 'Hancock', 'Crocodile',
  'Doflamingo', 'Katakuri', 'Kaido', 'BigMom', 'Law', 'Kidd', 'Blackbeard',
  'Akainu', 'Aokiji', 'Fujitora', 'Jinbe', 'Whitebeard', 'Coby', 'Vivi',

  // Bleach
  'Ichigo', 'Rukia', 'Orihime', 'Chad', 'Ishida', 'Renji', 'Byakuya', 'Toshiro',
  'Matsumoto', 'Kenpachi', 'Yoruichi', 'Urahara', 'Gin', 'Ulquiorra', 'Grimmjow',
  'Aizen', 'Unohana', 'Shunsui', 'Ukitake', 'Komamura', 'Shinji',

  // Pokémon
  'Pikachu', 'Mewtwo', 'Charizard', 'Bulbasaur', 'Squirtle', 'Gengar', 'Snorlax',
  'Eevee', 'Jigglypuff', 'Psyduck', 'Meowth', 'Togepi', 'Lapras', 'Articuno',
  'Zapdos', 'Moltres', 'Mew', 'Raichu', 'Lucario', 'Greninja', 'Garchomp',
  'Sylveon', 'Espeon', 'Umbreon', 'Vaporeon', 'Flareon', 'Jolteon', 'Glaceon',

  // Digimon
  'Agumon', 'Gabumon', 'Patamon', 'Biyomon', 'Palmon', 'Tentomon', 'Gomamon',
  'Gatomon', 'Wargreymon', 'Omnimon', 'Guilmon', 'Renamon', 'Terriermon',
  'Impmon', 'Beelzemon', 'Gallantmon', 'Sakuyamon',

  // Yu-Gi-Oh!
  'Yugi', 'Kaiba', 'Joey', 'Bakura', 'Marik', 'Pegasus', 'Ishizu', 'Mokuba',
  'Jaden', 'Yusei', 'Yuma', 'Yuya',

  // Sailor Moon
  'Serena', 'Ami', 'Rei', 'Makoto', 'Minako', 'Chibiusa', 'Haruka', 'Michiru',
  'Setsuna', 'Hotaru', 'Mamoru', 'Seiya', 'Yaten', 'Taiki', 'Galaxia',

  // Fullmetal Alchemist / Brotherhood
  'Edward', 'Alphonse', 'Roy', 'Riza', 'Winry', 'Hughes', 'Armstrong', 'Scar',
  'Envy', 'Pride', 'Lust', 'Gluttony', 'Wrath', 'Greed', 'Hohenheim', 'Ling',
  'Mei', 'Lan Fan',

  // InuYasha
  'Inuyasha', 'Kagome', 'Miroku', 'Sango', 'Shippo', 'Sesshomaru', 'Kikyo',
  'Naraku', 'Rin', 'Jaken', 'Koga',

  // Cowboy Bebop
  'Spike', 'Jet', 'Faye', 'Radical Ed', 'Vicious',

  // Neon Genesis Evangelion
  'Shinji', 'Rei', 'Asuka', 'Misato', 'Gendo', 'Kaworu',

  // Ghost in the Shell
  'Motoko', 'Batou', 'Togusa',

  // Rurouni Kenshin
  'Kenshin', 'Kaoru', 'Sanosuke', 'Yahiko', 'Aoshi', 'Shishio',

  // Samurai Champloo
  'Mugen', 'Jin', 'Fuu',

  // Cardcaptor Sakura
  'Sakura', 'Tomoyo', 'Syaoran', 'Kero', 'Yue', 'Meiling',

  // Attack on Titan
  'Eren', 'Mikasa', 'Armin', 'Levi', 'Hange', 'Sasha', 'Connie', 'Jean',
  'Historia', 'Reiner', 'Bertholdt', 'Annie', 'Erwin', 'Ymir', 'Zeke',
  'Petra', 'Yelena', 'Floch',

  // Death Note
  'Light', 'Ryuk', 'Misa', 'Matsuda', 'Near', 'Mello',

  // Code Geass
  'Lelouch', 'Suzaku', 'Kallen', 'Nunnally', 'Schneizel', 'Cornelia',

  // Gurren Lagann
  'Simon', 'Kamina', 'Yoko', 'Nia', 'Viral', 'Lordgenome',

  // Fullmetal Panic
  'Sousuke', 'Kaname', 'Teletha',

  // Ouran Host Club
  'Haruhi', 'Tamaki', 'Kyoya', 'Hikaru', 'Kaoru', 'Mori', 'Honey',

  // My Hero Academia
  'Deku', 'Bakugo', 'Uraraka', 'Todoroki', 'Iida', 'Tsuyu', 'Kirishima',
  'Kaminari', 'Momo', 'Jirou', 'Tokoyami', 'Aizawa', 'AllMight', 'Hawks',
  'Endeavor', 'Mirko', 'Nejire', 'Tamaki', 'Togata', 'Shinso',

  // Demon Slayer
  'Tanjiro', 'Nezuko', 'Zenitsu', 'Inosuke', 'Giyu', 'Shinobu', 'Tengen',
  'Mitsuri', 'Obanai', 'Gyomei', 'Muichiro', 'Kanao', 'Rengoku', 'Yoriichi',

  // Jujutsu Kaisen
  'Itadori', 'Fushiguro', 'Kugisaki', 'Gojo', 'Nanami', 'Panda', 'Maki',
  'Toge', 'Choso', 'Yuta', 'Inumaki', 'Mahito', 'Sukuna',

  // Sword Art Online
  'Kirito', 'Asuna', 'Klein', 'Agil', 'Silica', 'Leafa', 'Sinon', 'Alice',

  // One Punch Man
  'Saitama', 'Genos', 'Fubuki', 'Tatsumaki', 'King', 'Bang', 'Garou',

  // Mob Psycho 100
  'Shigeo', 'Reigen', 'Dimple', 'Ritsu', 'Teru',

  // Re:Zero
  'Subaru', 'Rem', 'Ram', 'Emilia', 'Beatrice', 'Roswaal', 'Echidna',

  // Konosuba
  'Kazuma', 'Aqua', 'Darkness', 'Megumin', 'Wiz', 'Vanir',

  // Overlord
  'Ainz', 'Albedo', 'Shalltear', 'Demiurge', 'Cocytus', 'Narberal',

  // That Time I Got Reincarnated as a Slime
  'Rimuru', 'Benimaru', 'Shuna', 'Ranga', 'Milim', 'Shion', 'Gobta',

  // Spy x Family
  'Loid', 'Yor', 'Anya', 'Bond',

  // Chainsaw Man
  'Denji', 'Power', 'Aki', 'Makima', 'Reze', 'Kobeni',

  // Bocchi the Rock
  'Bocchi', 'Nijika', 'Ryo', 'Ikuyo',

  // Lycoris Recoil
  'Chisato', 'Takina',

  // Tokyo Revengers
  'Takemichi', 'Mikey', 'Draken', 'Chifuyu', 'Emma', 'Mitsuya',

  // Cyberpunk Edgerunners
  'David', 'Lucy', 'Maine', 'Rebecca', 'Kiwi', 'Pilar',

  // Arcane
  'Jinx', 'Vi', 'Jayce', 'Viktor', 'Silco', 'Caitlyn', 'Mel', 'Ekko',

  // Avatar: The Last Airbender
  'Aang', 'Katara', 'Sokka', 'Toph', 'Zuko', 'Azula', 'Iroh', 'Suki',
  'TyLee', 'Mai', 'Ozai', 'Jeong',

  // Legend of Korra
  'Korra', 'Mako', 'Bolin', 'Asami', 'Tenzin', 'Jinora', 'Amon', 'Zaheer',

  // Teen Titans (2003)
  'Robin', 'Starfire', 'Raven', 'Cyborg', 'BeastBoy', 'Terra', 'Slade',

  // Kim Possible
  'Kim', 'Ron', 'Wade', 'Shego', 'Drakken',

  // Danny Phantom
  'Danny', 'Sam', 'Tucker', 'Vlad', 'Valerie', 'Skulker',

  // Fairly OddParents
  'Timmy', 'Cosmo', 'Wanda', 'Trixie', 'Chester', 'Crocker', 'Vicky',

  // Powerpuff Girls
  'Blossom', 'Bubbles', 'Buttercup', 'Mojo', 'HIM',

  // Dexter's Laboratory
  'Dexter', 'DeeDee', 'Mandark',

  // Ed Edd n Eddy
  'Ed', 'Edd', 'Eddy', 'Kevin', 'Rolf', 'Jonny', 'Nazz', 'Sarah',

  // Foster's Home for Imaginary Friends
  'Mac', 'Bloo', 'Wilt', 'Eduardo', 'Coco', 'Frankie', 'Cheese',

  // Codename: Kids Next Door
  'Numbuh1', 'Numbuh2', 'Numbuh3', 'Numbuh4', 'Numbuh5',

  // Gravity Falls
  'Dipper', 'Mabel', 'Soos', 'Wendy', 'Bill', 'Ford', 'McGucket',

  // Adventure Time
  'Finn', 'Jake', 'Marceline', 'Bubblegum', 'IceKing', 'BMO', 'Gunter',
  'FlamePrincess', 'LSP', 'Huntress', 'Prismo',

  // Regular Show
  'Mordecai', 'Rigby', 'Benson', 'Pops', 'Skips', 'Muscle Man',

  // Steven Universe
  'Steven', 'Garnet', 'Amethyst', 'Pearl', 'Lapis', 'Peridot', 'Bismuth',
  'Connie', 'Spinel', 'Jasper', 'Ruby', 'Sapphire',

  // She-Ra and the Princesses of Power (2018)
  'Adora', 'Catra', 'Glimmer', 'Bow', 'Scorpia', 'Entrapta', 'Perfuma',
  'Mermista', 'Spinnerella', 'Netossa',

  // The Owl House
  'Luz', 'Eda', 'King', 'Amity', 'Willow', 'Gus', 'Hunter', 'Lilith',

  // Amphibia
  'Anne', 'Sprig', 'Polly', 'HopPop', 'Marcy', 'Sasha',

  // Miraculous Ladybug
  'Marinette', 'Adrien', 'Alya', 'Nino', 'Luka', 'Kagami',

  // Winx Club
  'Bloom', 'Stella', 'Flora', 'Musa', 'Tecna', 'Aisha', 'Roxy',

  // W.I.T.C.H.
  'Will', 'Irma', 'Taranee', 'Cornelia', 'HayLin',

  // Xiaolin Showdown
  'Omi', 'Raimundo', 'Kimiko', 'Clay', 'Chase',

  // Rugrats
  'Tommy', 'Chuckie', 'Angelica', 'Phil', 'Lil', 'Susie', 'Dil', 'Kimi',

  // Hey Arnold!
  'Arnold', 'Helga', 'Gerald', 'Phoebe', 'Sid', 'Stinky', 'Rhonda',

  // Recess
  'TJ', 'Spinelli', 'Gretchen', 'Mikey', 'Vince', 'Gus',

  // Animaniacs
  'Yakko', 'Wakko', 'Dot', 'Pinky', 'Brain', 'Slappy', 'Skippy', 'Minerva',

  // Tiny Toon Adventures
  'Buster', 'Babs', 'Plucky', 'Hamton', 'Elmyra', 'Montana',

  // DuckTales (2017)
  'Scrooge', 'Huey', 'Dewey', 'Louie', 'Webby', 'Launchpad', 'Della',

  // SpongeBob SquarePants
  'Spongebob', 'Patrick', 'Squidward', 'Sandy', 'Plankton', 'Gary', 'Larry',

  // Invader Zim
  'Zim', 'GIR', 'Dib', 'Gaz', 'Tallest',

  // Rocko's Modern Life
  'Rocko', 'Heffer', 'Filburt',

  // Batman: The Animated Series
  'Batman', 'Robin', 'Joker', 'Harley', 'Catwoman', 'PoisonIvy', 'Batgirl',
  'Nightwing', 'Bane',

  // X-Men: The Animated Series
  'Wolverine', 'Storm', 'Cyclops', 'Rogue', 'Gambit', 'Psylocke', 'Jubilee',
  'Beast', 'Nightcrawler', 'Colossus', 'Magneto', 'Mystique',

  // Spider-Man (90s animated)
  'Spiderman', 'MaryJane', 'Gwen', 'Venom', 'Carnage',

  // Gargoyles
  'Goliath', 'Elisa', 'Brooklyn', 'Lexington', 'Broadway', 'Hudson',

  // Hilda
  'Hilda', 'David', 'Frida', 'Alfur', 'Twig',

  // Disenchantment
  'Bean', 'Elfo', 'Luci',

  // Bob's Burgers
  'Bob', 'Linda', 'Tina', 'Gene', 'Louise',

  // Rick and Morty
  'Rick', 'Morty', 'Summer', 'Beth', 'Jerry', 'Birdperson',

  // Kipo and the Age of Wonderbeasts
  'Kipo', 'Wolf', 'Benson', 'Dave', 'Mandu',

  // Voltron: Legendary Defender
  'Shiro', 'Keith', 'Lance', 'Pidge', 'Hunk', 'Allura', 'Coran',

  // Star vs the Forces of Evil
  'Star', 'Marco', 'Janna', 'PonyHead', 'Tom',

  // Over the Garden Wall
  'Wirt', 'Greg', 'Beatrice', 'Beast',

  // We Bare Bears
  'Grizz', 'Panda', 'IceBear', 'Nom Nom',

  // Beastars
  'Legoshi', 'Haru', 'Louis', 'Juno',

  // Vinland Saga
  'Thorfinn', 'Askeladd', 'Bjorn', 'Canute',

  // Golden Kamuy
  'Sugimoto', 'Asirpa', 'Shiraishi', 'Ogata',

  // No Game No Life
  'Sora', 'Shiro', 'Steph', 'Jibril',

  // Darling in the FranXX
  'Hiro', 'ZeroTwo', 'Ichigo', 'Goro',

  // Fire Force
  'Shinra', 'Arthur', 'Maki', 'Obi',

  // Dr. Stone
  'Senku', 'Taiju', 'Chrome', 'Kohaku', 'Gen', 'Ruri',

  // Haikyuu!!
  'Hinata', 'Kageyama', 'Tsukishima', 'Nishinoya', 'Asahi', 'Sugawara',
  'Daichi', 'Tanaka', 'Kuroo', 'Kenma', 'Bokuto', 'Akaashi', 'Ushijima',

  // Blue Lock
  'Isagi', 'Bachira', 'Nagi', 'Reo', 'Rin', 'Sae', 'Kaiser',

  // Oshi no Ko
  'Aquamarine', 'Ruby', 'Kana', 'Mem',

  // Lycoris Recoil (ya están arriba, sin duplicar)

  // Black Clover
  'Asta', 'Yuno', 'Noelle', 'Magna', 'Luck', 'Finral',

  // Looney Tunes
  'Bugs', 'Daffy', 'Tweety', 'Sylvester', 'Porky', 'Elmer', 'Speedy',
  'Taz', 'Pepe', 'WileE',

  // Tom and Jerry / clásicos
  'Tom', 'Jerry', 'Droopy', 'Spike',

  // Classic Disney
  'Mickey', 'Donald', 'Goofy', 'Pluto', 'Timon', 'Pumbaa', 'Simba',
  'Stitch', 'Genie', 'Aladdin',
]

// ── 50 adjetivos positivos en español ────────────────────────────────────────

export const ADJETIVOS: string[] = [
  'Veloz',
  'Brillante',
  'Audaz',
  'Feroz',
  'Invicto',
  'Legendario',
  'Mágico',
  'Noble',
  'Ágil',
  'Astuto',
  'Certero',
  'Dinámico',
  'Épico',
  'Fiero',
  'Glorioso',
  'Heroico',
  'Implacable',
  'Intrépido',
  'Magistral',
  'Poderoso',
  'Radiante',
  'Sagaz',
  'Tenaz',
  'Único',
  'Valiente',
  'Acrobático',
  'Campeón',
  'Decidido',
  'Estelar',
  'Fantástico',
  'Genial',
  'Hábil',
  'Incansable',
  'Líder',
  'Meteórico',
  'Olímpico',
  'Prodigioso',
  'Rápido',
  'Supremo',
  'Triunfal',
  'Virtuoso',
  'Colosal',
  'Destellante',
  'Electrizante',
  'Formidable',
  'Osado',
  'Fenomenal',
  'Extraordinario',
  'Indomable',
  'Legendario',
]

// ── generarAlias: devuelve un alias único chequeado contra la DB ──────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generarAlias(supabase: any): Promise<string> {
  const MAX_INTENTOS = 10

  for (let i = 0; i < MAX_INTENTOS; i++) {
    const personaje = PERSONAJES[Math.floor(Math.random() * PERSONAJES.length)]
    const adjetivo  = ADJETIVOS[Math.floor(Math.random() * ADJETIVOS.length)]
    // Eliminar espacios del personaje para que sea una sola palabra
    const alias = `${personaje.replace(/\s+/g, '')}${adjetivo}`

    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('alias', alias)
      .maybeSingle()

    if (!data) return alias
  }

  // Fallback: agregar número para evitar colisión
  const personaje = PERSONAJES[Math.floor(Math.random() * PERSONAJES.length)]
  const adjetivo  = ADJETIVOS[Math.floor(Math.random() * ADJETIVOS.length)]
  const num       = Math.floor(Math.random() * 90) + 10
  return `${personaje.replace(/\s+/g, '')}${adjetivo}${num}`
}
