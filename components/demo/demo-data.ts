export type InterestLevel = "alto" | "medio" | "bajo";
export type Status = "activo" | "procesado" | "pendiente" | "completado" | "en progreso";
export type MessageType = "text" | "audio" | "image" | "card" | "product" | "note";
export type ContentType = "text" | "audio" | "photo" | "card" | "product" | "note";

export type Supplier = {
  id: string;
  name: string;
  city: string;
  category: string;
  categoryKey?: string;
  contactName: string;
  contactRole: string;
  interest: InterestLevel;
  status: Status;
  productCount: number;
  lastInteraction: string;
  notes: string;
  phone?: string;
  email?: string;
};

export type Product = {
  id: string;
  name: string;
  supplierId: string;
  supplierName: string;
  category: string;
  categoryKey?: string;
  city: string;
  interest: InterestLevel;
  notes: string;
  price?: string;
  moq?: string;
};

export type Contact = {
  id: string;
  name: string;
  role: string;
  supplierId: string;
  supplierName: string;
  city: string;
  channel: string;
  notes: string;
};

export type TimelineEvent = {
  id: string;
  day: number;
  date: string;
  city: string;
  title: string;
  description: string;
  type: ContentType;
};

export type DetectedInfo = {
  supplier?: string;
  product?: string;
  city?: string;
  category?: string;
  categoryKey?: string;
  interest?: InterestLevel;
  interestKey?: string;
  status?: string;
  statusKey?: string;
  nextAction?: string;
  nextActionKey?: string;
};

export type ChatAction = {
  id: string;
  label: string;
  response: string;
  labelKey?: string;
};

export type ChatMessage = {
  id: string;
  sender: "user" | "bot";
  type: "text" | "audio" | "image" | "card";
  content: string;
  time: string;
  imageLabel?: string;
  contentKey?: string;
  imageLabelKey?: string;
  tKey?: string;
};

export type Conversation = {
  id: string;
  title: string;
  preview: string;
  previewKey?: string;
  unread: boolean;
  messages: ChatMessage[];
  detected: DetectedInfo;
  actions: ChatAction[];
};

export type Traveler = {
  id: string;
  name: string;
  company: string;
  trip: string;
  tripKey?: string;
  dates: string;
  datesKey?: string;
  cities: string[];
  mode: string;
  modeKey?: string;
  status: Status;
  statusKey?: string;
};

export type AdminTraveler = {
  id: string;
  name: string;
  company: string;
  trip: string;
  tripKey?: string;
  status: string;
  statusKey?: string;
};

export type AdminRoute = {
  id: string;
  travelerName: string;
  travelerCompany: string;
  cities: string[];
};

export type AdminReport = {
  id: string;
  title: string;
  traveler: string;
  status: Status;
};

export type AdminSupplier = {
  id: string;
  name: string;
  city: string;
  category: string;
  categoryKey?: string;
  travelers: string[];
  interest: InterestLevel;
  status: Status;
};

export type Feedback = {
  id: string;
  quote: string;
  quoteKey?: string;
  name: string;
  company: string;
  rating: number;
};

export const demoTraveler: Traveler = {
  id: "martin-alvarez",
  name: "Martín Álvarez",
  company: "Muebles Patagonia",
  trip: "Feria de Cantón 2026",
  tripKey: "auto.components_demo_demo_data_319",
  dates: "14 al 22 de octubre de 2026",
  datesKey: "auto.components_demo_demo_data_320",
  cities: ["Guangzhou", "Shenzhen", "Foshan"],
  mode: "Negocios / Proveedores",
  modeKey: "auto.components_demo_demo_data_321",
  status: "activo",
  statusKey: "auto.Valores_reutilizados_210",
};

export const suppliers: Supplier[] = [
  {
    id: "shenzhen-hometech",
    name: "Shenzhen HomeTech Co.",
    city: "Shenzhen",
    category: "Hogar inteligente", categoryKey: "auto.Valores_reutilizados_215",
    contactName: "Li Wei",
    contactRole: "Ventas",
    interest: "alto",
    status: "activo",
    productCount: 4,
    lastInteraction: "Hace 2 horas",
    notes: "Detectado desde tarjeta. Interés alto por smart home. Pendiente confirmar certificaciones.",
    phone: "+86 755 1234 5678",
    email: "liwei@hometech.cn",
  },
  {
    id: "guangzhou-bamboo",
    name: "Guangzhou Bamboo Living",
    city: "Guangzhou",
    category: "Productos de bambú", categoryKey: "auto.Valores_reutilizados_216",
    contactName: "Chen Rong",
    contactRole: "Export Manager",
    interest: "alto",
    status: "activo",
    productCount: 5,
    lastInteraction: "Hace 4 horas",
    notes: "Especialistas en organizadores y artículos de bambú. Buenos precios y MOQ flexible.",
    phone: "+86 20 8765 4321",
    email: "chen.rong@bambooliving.cn",
  },
  {
    id: "foshan-modern",
    name: "Foshan Modern Furniture",
    city: "Foshan",
    category: "Muebles", categoryKey: "auto.Valores_reutilizados_217",
    contactName: "Wang Min",
    contactRole: "Sales Director",
    interest: "medio",
    status: "activo",
    productCount: 3,
    lastInteraction: "Ayer",
    notes: "Fábrica de muebles modernos. Revisar tiempos de producción para sillas.",
    phone: "+86 757 9876 5432",
    email: "wangmin@foshanfurniture.cn",
  },
  {
    id: "canton-led",
    name: "Canton LED Works",
    city: "Guangzhou",
    category: "Iluminación", categoryKey: "auto.Valores_reutilizados_218",
    contactName: "Zhang Mei",
    contactRole: "Sales Manager",
    interest: "alto",
    status: "activo",
    productCount: 6,
    lastInteraction: "Hace 5 horas",
    notes: "Lámparas LED decorativas. MOQ 500 unidades. Precio estimado USD 4,80.",
    phone: "+86 20 1122 3344",
    email: "zhangmei@cantonled.cn",
  },
  {
    id: "pearl-river",
    name: "Pearl River Packaging",
    city: "Guangzhou",
    category: "Packaging", categoryKey: "auto.Valores_reutilizados_219",
    contactName: "Liu Fang",
    contactRole: "Packaging Specialist",
    interest: "medio",
    status: "activo",
    productCount: 2,
    lastInteraction: "Hace 8 horas",
    notes: "Packaging premium para cosmética. Muestras disponibles.",
    phone: "+86 20 5566 7788",
    email: "liufang@prpackaging.cn",
  },
  {
    id: "asia-trade",
    name: "Asia Trade Solutions",
    city: "Shenzhen",
    category: "Trading company", categoryKey: "auto.Valores_reutilizados_220",
    contactName: "Huang Tao",
    contactRole: "Account Manager",
    interest: "bajo",
    status: "procesado",
    productCount: 1,
    lastInteraction: "Hace 2 días",
    notes: "Trading general. No alineado con rubro actual del viajero.",
    phone: "+86 755 9988 7766",
    email: "huang@asiatrade.cn",
  },
];

export const products: Product[] = [
  {
    id: "lampara-led",
    name: "Lámpara LED decorativa",
    supplierId: "canton-led",
    supplierName: "Canton LED Works",
    category: "Iluminación", categoryKey: "auto.Valores_reutilizados_218",
    city: "Guangzhou",
    interest: "alto",
    notes: "Mencionada en audio de reunión. Diseño moderno y buen precio.",
    price: "USD 4,80 / unidad",
    moq: "500 unidades",
  },
  {
    id: "organizadores-bambu",
    name: "Set organizadores de bambú",
    supplierId: "guangzhou-bamboo",
    supplierName: "Guangzhou Bamboo Living",
    category: "Hogar",
    city: "Guangzhou",
    interest: "alto",
    notes: "Detectado por foto. Interés sugerido alto.",
    price: "A confirmar",
    moq: "300 unidades",
  },
  {
    id: "silla-plegable",
    name: "Silla ergonómica plegable",
    supplierId: "foshan-modern",
    supplierName: "Foshan Modern Furniture",
    category: "Muebles", categoryKey: "auto.Valores_reutilizados_217",
    city: "Foshan",
    interest: "medio",
    notes: "Revisar ergonomía y materiales. Pendiente muestra.",
    price: "USD 32 / unidad",
    moq: "200 unidades",
  },
  {
    id: "packaging-cosmetica",
    name: "Packaging premium para cosmética",
    supplierId: "pearl-river",
    supplierName: "Pearl River Packaging",
    category: "Packaging", categoryKey: "auto.Valores_reutilizados_219",
    city: "Guangzhou",
    interest: "medio",
    notes: "Interés para línea propia. Pedir muestras.",
    price: "A cotizar",
    moq: "1.000 unidades",
  },
  {
    id: "mesa-modular",
    name: "Mesa auxiliar modular",
    supplierId: "foshan-modern",
    supplierName: "Foshan Modern Furniture",
    category: "Muebles", categoryKey: "auto.Valores_reutilizados_217",
    city: "Foshan",
    interest: "medio",
    notes: "Diseño versátil. Evaluar combinaciones.",
    price: "USD 45 / unidad",
    moq: "150 unidades",
  },
  {
    id: "sensor-smart",
    name: "Sensor smart home básico",
    supplierId: "shenzhen-hometech",
    supplierName: "Shenzhen HomeTech Co.",
    category: "Hogar inteligente", categoryKey: "auto.Valores_reutilizados_215",
    city: "Shenzhen",
    interest: "alto",
    notes: "Compatible con asistentes principales. Revisar certificaciones.",
    price: "USD 8,50 / unidad",
    moq: "1.000 unidades",
  },
];

export const contacts: Contact[] = [
  {
    id: "li-wei",
    name: "Li Wei",
    role: "Ventas",
    supplierId: "shenzhen-hometech",
    supplierName: "Shenzhen HomeTech Co.",
    city: "Shenzhen",
    channel: "WhatsApp",
    notes: "Habla inglés. Responde rápido. Enviar especificaciones técnicas.",
  },
  {
    id: "chen-rong",
    name: "Chen Rong",
    role: "Export Manager",
    supplierId: "guangzhou-bamboo",
    supplierName: "Guangzhou Bamboo Living",
    city: "Guangzhou",
    channel: "WeChat",
    notes: "Muy profesional. Tiene experiencia exportando a Latinoamérica.",
  },
  {
    id: "wang-min",
    name: "Wang Min",
    role: "Sales Director",
    supplierId: "foshan-modern",
    supplierName: "Foshan Modern Furniture",
    city: "Foshan",
    channel: "WhatsApp",
    notes: "Directora comercial. Coordinar visita a fábrica.",
  },
  {
    id: "liu-fang",
    name: "Liu Fang",
    role: "Packaging Specialist",
    supplierId: "pearl-river",
    supplierName: "Pearl River Packaging",
    city: "Guangzhou",
    channel: "Email",
    notes: "Especialista en diseño de packaging. Enviar referencias.",
  },
];

export const timelineEvents: TimelineEvent[] = [
  {
    id: "t1",
    day: 1,
    date: "14 oct",
    city: "Guangzhou",
    title: "Llegada y primeras reuniones",
    description: "Registro de proveedores de muebles y decoración en la feria.",
    type: "text",
  },
  {
    id: "t2",
    day: 1,
    date: "14 oct",
    city: "Guangzhou",
    title: "Tarjeta Shenzhen HomeTech",
    description: "Foto de tarjeta de contacto enviada por WhatsApp.",
    type: "card",
  },
  {
    id: "t3",
    day: 2,
    date: "15 oct",
    city: "Guangzhou",
    title: "Reunión Canton LED Works",
    description: "Audio de 0:42 con detalles de lámparas LED decorativas.",
    type: "audio",
  },
  {
    id: "t4",
    day: 2,
    date: "15 oct",
    city: "Guangzhou",
    title: "Foto organizadores de bambú",
    description: "Imagen de producto detectada como potencial.",
    type: "photo",
  },
  {
    id: "t5",
    day: 3,
    date: "16 oct",
    city: "Shenzhen",
    title: "Electrónica y accesorios",
    description: "Visitas a proveedores de hogar inteligente.",
    type: "product",
  },
  {
    id: "t6",
    day: 3,
    date: "16 oct",
    city: "Shenzhen",
    title: "Checklist proveedor packaging",
    description: "Preguntas sugeridas por el Asistente Nihao para próxima reunión.",
    type: "note",
  },
  {
    id: "t7",
    day: 4,
    date: "17 oct",
    city: "Foshan",
    title: "Fábrica Foshan Modern Furniture",
    description: "Recorrido por fábrica de muebles. Registro de silla y mesa.",
    type: "photo",
  },
  {
    id: "t8",
    day: 4,
    date: "17 oct",
    city: "Foshan",
    title: "Resumen del día",
    description: "Cierre automático con proveedores, productos y pendientes.",
    type: "text",
  },
];

export const whatsappConversations: Conversation[] = [
  {
    id: "tarjeta",
    title: "Shenzhen HomeTech Co.",
    preview: "Detecté un posible proveedor...",
        previewKey: "auto.components_demo_demo_data_whatsappConversations_365",
    unread: true,
    messages: [
      {
        id: "m1",
        sender: "user",
        type: "text",
        content: "Te paso la tarjeta del proveedor que conocí recién.",
        contentKey: "auto.components_demo_demo_data_whatsappConversations_366",
        time: "10:42",
      },
      {
        id: "m2",
        sender: "user",
        type: "image",
        content: "Tarjeta de presentación",
        contentKey: "auto.components_demo_demo_data_whatsappConversations_367",
        imageLabel: "Tarjeta Shenzhen HomeTech",
        imageLabelKey: "auto.components_demo_demo_data_timelineEvents_351",
        time: "10:42",
      },
      {
        id: "m3",
        sender: "bot",
        type: "text",
        content:
          "Detecté un posible proveedor: Shenzhen HomeTech Co.\n\nCiudad: Shenzhen\nCategoría: productos para el hogar\nContacto: Li Wei\n\n¿Querés guardarlo como proveedor de interés?",
        tKey: "auto.components_demo_demo_data_whatsappConversations_368",
        time: "10:43",
      },
    ],
    detected: {
      supplier: "Shenzhen HomeTech Co.",
      city: "Shenzhen",
      category: "Hogar inteligente", categoryKey: "auto.Valores_reutilizados_215",
      interest: "alto",
      interestKey: "auto.Valores_reutilizados_207",
      status: "Pendiente de confirmar",
      statusKey: "auto.components_demo_demo_data_whatsappConversations_369",
      nextAction: "Guardar como proveedor de interés",
      nextActionKey: "auto.components_demo_demo_data_whatsappConversations_370",
    },
    actions: [
      { id: "guardar", label: "Guardar proveedor", labelKey: "auto.components_demo_demo_data_whatsappConversations_371", response: "Proveedor guardado en tu tablero." },
      { id: "asociar", label: "Asociar al viaje", labelKey: "auto.components_demo_demo_data_whatsappConversations_373", response: "Proveedor asociado al viaje Feria de Cantón 2026." },
      { id: "ver", label: "Ver datos detectados", labelKey: "auto.components_demo_demo_data_whatsappConversations_375", response: "Datos detectados listados en el panel lateral." },
    ],
  },
  {
    id: "audio",
    title: "Canton LED Works",
    preview: "Transcribí el audio y armé un resumen.",
        previewKey: "auto.components_demo_demo_data_whatsappConversations_377",
    unread: false,
    messages: [
      {
        id: "m4",
        sender: "user",
        type: "audio",
        content: "Audio de 0:42",
        contentKey: "auto.components_demo_demo_data_whatsappConversations_378",
        time: "14:18",
      },
      {
        id: "m5",
        sender: "bot",
        type: "text",
        content:
          "Transcribí el audio y armé un resumen:\n\n• Producto: lámparas LED decorativas\n• MOQ mencionado: 500 unidades\n• Precio estimado: USD 4,80 por unidad\n• Pendiente: confirmar certificaciones y tiempos de producción",
        tKey: "auto.components_demo_demo_data_whatsappConversations_379",
        time: "14:19",
      },
    ],
    detected: {
      supplier: "Canton LED Works",
      product: "Lámpara LED decorativa",
      city: "Guangzhou",
      category: "Iluminación", categoryKey: "auto.Valores_reutilizados_218",
      interest: "alto",
      interestKey: "auto.Valores_reutilizados_207",
      status: "Procesado",
      statusKey: "auto.Valores_reutilizados_211",
      nextAction: "Crear tarea de seguimiento",
      nextActionKey: "auto.components_demo_demo_data_whatsappConversations_380",
    },
    actions: [
      { id: "guardar-resumen", label: "Guardar resumen", labelKey: "auto.components_demo_demo_data_whatsappConversations_381", response: "Resumen guardado en el tablero del viajero." },
      { id: "tarea", label: "Crear tarea de seguimiento", labelKey: "auto.components_demo_demo_data_whatsappConversations_380", response: "Tarea creada: confirmar certificaciones LED." },
      { id: "preguntas", label: "Ver preguntas sugeridas", labelKey: "auto.components_demo_demo_data_whatsappConversations_384", response: "Mostrando preguntas recomendadas para este proveedor." },
    ],
  },
  {
    id: "foto-producto",
    title: "Guangzhou Bamboo Living",
    preview: "Detecté un producto potencial...",
        previewKey: "auto.components_demo_demo_data_whatsappConversations_386",
    unread: false,
    messages: [
      {
        id: "m6",
        sender: "user",
        type: "image",
        content: "Foto de producto",
        contentKey: "auto.components_demo_demo_data_whatsappConversations_387",
        imageLabel: "Set organizadores de bambú",
        imageLabelKey: "auto.components_demo_demo_data_products_330",
        time: "16:55",
      },
      {
        id: "m7",
        sender: "bot",
        type: "text",
        content:
          "Detecté un producto potencial. ¿Querés asociarlo al proveedor anterior?\n\n• Producto: set de organizadores de bambú\n• Categoría: hogar\n• Interés sugerido: alto\n• Proveedor asociado: Guangzhou Bamboo Living",
        tKey: "auto.components_demo_demo_data_whatsappConversations_388",
        time: "16:56",
      },
    ],
    detected: {
      supplier: "Guangzhou Bamboo Living",
      product: "Set organizadores de bambú",
      city: "Guangzhou",
      category: "Hogar",
      interest: "alto",
      interestKey: "auto.Valores_reutilizados_207",
      status: "Procesado",
      statusKey: "auto.Valores_reutilizados_211",
      nextAction: "Asociar producto al proveedor",
      nextActionKey: "auto.components_demo_demo_data_whatsappConversations_389",
    },
    actions: [
      { id: "asociar-prod", label: "Asociar producto", labelKey: "auto.components_demo_demo_data_whatsappConversations_390", response: "Producto asociado a Guangzhou Bamboo Living." },
      { id: "interes", label: "Marcar interés alto", labelKey: "auto.components_demo_demo_data_whatsappConversations_392", response: "Interés marcado como alto." },
      { id: "nota", label: "Agregar nota", labelKey: "auto.components_demo_demo_data_whatsappConversations_394", response: "Nota agregada al producto." },
    ],
  },
  {
    id: "preguntas",
    title: "Checklist packaging",
    preview: "Te sugiero validar estos puntos...",
        previewKey: "auto.components_demo_demo_data_whatsappConversations_397",
    unread: false,
    messages: [
      {
        id: "m8",
        sender: "user",
        type: "text",
        content: "Estoy por reunirme con un proveedor de packaging. ¿Qué le pregunto?",
        contentKey: "auto.components_demo_demo_data_whatsappConversations_398",
        time: "09:12",
      },
      {
        id: "m9",
        sender: "bot",
        type: "text",
        content:
          "Te sugiero validar estos puntos antes de avanzar:\n\n• MOQ\n• Tiempos de producción\n• Certificaciones\n• Capacidad mensual\n• Condiciones de pago\n• Posibilidad de muestras\n• Experiencia exportando a Argentina",
        tKey: "auto.components_demo_demo_data_whatsappConversations_399",
        time: "09:12",
      },
    ],
    detected: {
      supplier: "Pearl River Packaging",
      city: "Guangzhou",
      category: "Packaging", categoryKey: "auto.Valores_reutilizados_219",
      interest: "medio",
      interestKey: "auto.Valores_reutilizados_208",
      status: "Pendiente de confirmar",
      statusKey: "auto.components_demo_demo_data_whatsappConversations_369",
      nextAction: "Guardar checklist",
      nextActionKey: "auto.components_demo_demo_data_whatsappConversations_400",
    },
    actions: [
      { id: "checklist", label: "Guardar checklist", labelKey: "auto.components_demo_demo_data_whatsappConversations_400", response: "Checklist guardado en tu reporte." },
      { id: "reporte", label: "Enviar a mi reporte", labelKey: "auto.components_demo_demo_data_whatsappConversations_402", response: "Checklist añadido al informe de viaje." },
      { id: "usado", label: "Marcar como usado", labelKey: "auto.components_demo_demo_data_whatsappConversations_404", response: "Checklist marcado como usado." },
    ],
  },
  {
    id: "resumen-dia",
    title: "Resumen del día",
    preview: "Hoy registraste 4 proveedores...",
        previewKey: "auto.components_demo_demo_data_whatsappConversations_406",
    unread: false,
    messages: [
      {
        id: "m10",
        sender: "user",
        type: "text",
        content: "Cerrame el resumen del día.",
        contentKey: "auto.components_demo_demo_data_whatsappConversations_407",
        time: "20:30",
      },
      {
        id: "m11",
        sender: "bot",
        type: "text",
        content:
          "Hoy registraste 4 proveedores, 7 productos, 2 contactos clave y 3 pendientes de seguimiento.\n\nResumen por ciudad/categoría:\n• Guangzhou: iluminación, hogar, packaging\n• Shenzhen: hogar inteligente, electrónica\n• Foshan: muebles",
        tKey: "auto.components_demo_demo_data_whatsappConversations_408",
        time: "20:31",
      },
    ],
    detected: {
      supplier: "Múltiples",
      city: "Guangzhou / Shenzhen / Foshan",
      category: "Varias",
      interest: "alto",
      interestKey: "auto.Valores_reutilizados_207",
      status: "Completado",
      statusKey: "auto.Valores_reutilizados_213",
      nextAction: "Exportar resumen",
      nextActionKey: "auto.components_demo_demo_data_whatsappConversations_410",
    },
    actions: [
      { id: "timeline", label: "Ver timeline", labelKey: "auto.components_demo_demo_data_whatsappConversations_411", response: "Abriendo timeline del viaje." },
      { id: "exportar", label: "Exportar resumen", labelKey: "auto.components_demo_demo_data_whatsappConversations_410", response: "Resumen exportado correctamente." },
      { id: "tablero", label: "Ir a tablero del viajero", labelKey: "auto.components_demo_demo_data_whatsappConversations_414", response: "Redirigiendo al tablero del viajero." },
    ],
  },
];

export const adminTravelers: AdminTraveler[] = [
  { id: "martin", name: "Martín Álvarez", company: "Muebles Patagonia", trip: "Feria de Cantón 2026", tripKey: "auto.components_demo_demo_data_319", status: "Activo", statusKey: "auto.Valores_visibles_con_may_scula_465" },
  { id: "carolina", name: "Carolina Méndez", company: "Casa Nórdica", trip: "Sourcing Hogar", tripKey: "auto.components_demo_demo_data_416", status: "Informe listo", statusKey: "auto.components_demo_demo_data_417" },
  { id: "joaquin", name: "Joaquín Rivas", company: "Importadora Sur", trip: "Electrónica", tripKey: "auto.Valores_reutilizados_222", status: "Activo", statusKey: "auto.Valores_visibles_con_may_scula_465" },
  { id: "valentina", name: "Valentina Costa", company: "Deco Market", trip: "Packaging/Hogar", status: "Pendiente revisión", statusKey: "auto.components_demo_demo_data_418" },
  { id: "academy", name: "Grupo Academy Octubre", company: "Nihao Academy", trip: "Inmersión internacional", tripKey: "auto.components_demo_demo_data_420", status: "Activo", statusKey: "auto.Valores_visibles_con_may_scula_465" },
];

export const adminRoutes: AdminRoute[] = [
  { id: "r1", travelerName: "Martín Álvarez", travelerCompany: "Muebles Patagonia", cities: ["Guangzhou", "Shenzhen", "Foshan"] },
  { id: "r2", travelerName: "Carolina Méndez", travelerCompany: "Casa Nórdica", cities: ["Shanghai", "Hangzhou"] },
  { id: "r3", travelerName: "Joaquín Rivas", travelerCompany: "Importadora Sur", cities: ["Guangzhou", "Dongguan"] },
  { id: "r4", travelerName: "Valentina Costa", travelerCompany: "Deco Market", cities: ["Shenzhen", "Guangzhou"] },
  { id: "r5", travelerName: "Grupo Academy Octubre", travelerCompany: "Nihao Academy", cities: ["Beijing", "Shanghai", "Suzhou"] },
];

export const adminReports: AdminReport[] = [
  { id: "rep1", title: "Informe Martín Álvarez", traveler: "Muebles Patagonia", status: "completado" },
  { id: "rep2", title: "Informe Carolina Méndez", traveler: "Casa Nórdica", status: "completado" },
  { id: "rep3", title: "Informe Joaquín Rivas", traveler: "Importadora Sur", status: "en progreso" },
  { id: "rep4", title: "Informe Grupo Academy Octubre", traveler: "Nihao Academy", status: "en progreso" },
];

export const adminSuppliers: AdminSupplier[] = [
  { id: "as1", name: "Shenzhen HomeTech Co.", city: "Shenzhen", category: "Hogar inteligente", categoryKey: "auto.Valores_reutilizados_215", travelers: ["Martín Álvarez"], interest: "alto", status: "activo" },
  { id: "as2", name: "Guangzhou Bamboo Living", city: "Guangzhou", category: "Productos de bambú", categoryKey: "auto.Valores_reutilizados_216", travelers: ["Martín Álvarez", "Carolina Méndez"], interest: "alto", status: "activo" },
  { id: "as3", name: "Foshan Modern Furniture", city: "Foshan", category: "Muebles", categoryKey: "auto.Valores_reutilizados_217", travelers: ["Martín Álvarez"], interest: "medio", status: "activo" },
  { id: "as4", name: "Canton LED Works", city: "Guangzhou", category: "Iluminación", categoryKey: "auto.Valores_reutilizados_218", travelers: ["Martín Álvarez"], interest: "alto", status: "activo" },
  { id: "as5", name: "Pearl River Packaging", city: "Guangzhou", category: "Packaging", categoryKey: "auto.Valores_reutilizados_219", travelers: ["Martín Álvarez", "Valentina Costa"], interest: "medio", status: "activo" },
  { id: "as6", name: "Asia Trade Solutions", city: "Shenzhen", category: "Trading company", categoryKey: "auto.Valores_reutilizados_220", travelers: ["Joaquín Rivas"], interest: "bajo", status: "procesado" },
];

export const feedback: Feedback[] = [
  { id: "f1", quote: "El asistente me ayudó a no perder información entre reuniones y fotos.",
    quoteKey: "auto.components_demo_demo_data_425", name: "Martín Álvarez", company: "Muebles Patagonia", rating: 5 },
  { id: "f2", quote: "Volví con un informe mucho más ordenado de lo que esperaba.",
    quoteKey: "auto.components_demo_demo_data_426", name: "Carolina Méndez", company: "Casa Nórdica", rating: 5 },
  { id: "f3", quote: "Me sirvió para registrar proveedores mientras caminaba la feria.",
    quoteKey: "auto.components_demo_demo_data_427", name: "Joaquín Rivas", company: "Importadora Sur", rating: 4 },
  { id: "f4", quote: "Tener todo en un solo lugar me dio tranquilidad durante el viaje.",
    quoteKey: "auto.components_demo_demo_data_428", name: "Valentina Costa", company: "Deco Market", rating: 5 },
];

export const adminMetrics = {
  activeTravelers: 18,
  registeredSuppliers: 146,
  reviewedProducts: 312,
  generatedReports: 42,
  visitedCities: 9,
  satisfaction: 4.8,
};

export const travelerMetrics = {
  suppliers: 12,
  products: 24,
  contacts: 8,
  cities: 3,
  pending: 5,
  reports: 1,
};

export const recentActivity: { text: string; tKey: string }[] = [
  { text: "Martín Álvarez guardó un proveedor en Shenzhen.", tKey: "auto.components_demo_demo_data_429" },
  { text: "Carolina Méndez generó un resumen diario.", tKey: "auto.components_demo_demo_data_430" },
  { text: "Grupo Academy Octubre cargó 8 contactos nuevos.", tKey: "auto.components_demo_demo_data_431" },
  { text: "Joaquín Rivas marcó 3 proveedores para seguimiento.", tKey: "auto.components_demo_demo_data_432" },
];

export const interestColor: Record<InterestLevel, string> = {
  alto: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  medio: "bg-amber-100 text-amber-800 ring-amber-200",
  bajo: "bg-slate-100 text-slate-700 ring-slate-200",
};

export const statusColor: Record<string, string> = {
  activo: "bg-nihao-soft text-nihao ring-nihao/20",
  procesado: "bg-blue-50 text-blue-700 ring-blue-100",
  pendiente: "bg-amber-50 text-amber-700 ring-amber-100",
  completado: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  "en progreso": "bg-violet-50 text-violet-700 ring-violet-100",
};

export const demoCopy = {
  brandTagline: "Tu compañero inteligente durante el viaje de negocios en China.",
  helperText: "Registrá proveedores, productos, audios, fotos y notas desde WhatsApp.",
  reportText: "Convertí el recorrido del viaje en un informe accionable.",
  poweredBy: "Powered by Broco Solutions",
  demoLabel: "Demo interactiva",
};
