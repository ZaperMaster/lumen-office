/* Funciones con su nombre en español, para el asistente y el autocompletado. */

export interface FnInfo {
  name: string;
  syntax: string;
  desc: string;
  cat: "Matemáticas" | "Estadística" | "Lógicas" | "Texto" | "Fecha y hora" | "Búsqueda" | "Financieras";
}

export const FN_INFO: FnInfo[] = [
  { name: "SUMA", syntax: "SUMA(número1; [número2]; …)", desc: "Suma todos los números de un rango.", cat: "Matemáticas" },
  { name: "PROMEDIO", syntax: "PROMEDIO(número1; [número2]; …)", desc: "Media aritmética de los números.", cat: "Estadística" },
  { name: "CONTAR", syntax: "CONTAR(valor1; [valor2]; …)", desc: "Cuenta las celdas que contienen números.", cat: "Estadística" },
  { name: "CONTARA", syntax: "CONTARA(valor1; [valor2]; …)", desc: "Cuenta las celdas que no están vacías.", cat: "Estadística" },
  { name: "CONTAR.BLANCO", syntax: "CONTAR.BLANCO(rango)", desc: "Cuenta las celdas vacías.", cat: "Estadística" },
  { name: "MAX", syntax: "MAX(número1; [número2]; …)", desc: "El valor más alto.", cat: "Estadística" },
  { name: "MIN", syntax: "MIN(número1; [número2]; …)", desc: "El valor más bajo.", cat: "Estadística" },
  { name: "MEDIANA", syntax: "MEDIANA(número1; …)", desc: "El valor central de los números.", cat: "Estadística" },
  { name: "MODA", syntax: "MODA(número1; …)", desc: "El valor que más se repite.", cat: "Estadística" },
  { name: "DESVEST", syntax: "DESVEST(número1; …)", desc: "Desviación estándar de una muestra.", cat: "Estadística" },
  { name: "K.ESIMO.MAYOR", syntax: "K.ESIMO.MAYOR(rango; k)", desc: "El k-ésimo valor más alto.", cat: "Estadística" },
  { name: "K.ESIMO.MENOR", syntax: "K.ESIMO.MENOR(rango; k)", desc: "El k-ésimo valor más bajo.", cat: "Estadística" },
  { name: "JERARQUIA", syntax: "JERARQUIA(número; rango; [orden])", desc: "Posición de un número en una lista.", cat: "Estadística" },
  { name: "SUMAR.SI", syntax: "SUMAR.SI(rango; criterio; [rango_suma])", desc: "Suma las celdas que cumplen una condición.", cat: "Matemáticas" },
  { name: "SUMAR.SI.CONJUNTO", syntax: "SUMAR.SI.CONJUNTO(rango_suma; rango1; criterio1; …)", desc: "Suma con varias condiciones.", cat: "Matemáticas" },
  { name: "CONTAR.SI", syntax: "CONTAR.SI(rango; criterio)", desc: "Cuenta las celdas que cumplen una condición.", cat: "Estadística" },
  { name: "CONTAR.SI.CONJUNTO", syntax: "CONTAR.SI.CONJUNTO(rango1; criterio1; …)", desc: "Cuenta con varias condiciones.", cat: "Estadística" },
  { name: "PROMEDIO.SI", syntax: "PROMEDIO.SI(rango; criterio; [rango_promedio])", desc: "Media de las celdas que cumplen una condición.", cat: "Estadística" },
  { name: "PROMEDIO.SI.CONJUNTO", syntax: "PROMEDIO.SI.CONJUNTO(rango_promedio; rango1; criterio1; …)", desc: "Media con varias condiciones.", cat: "Estadística" },
  { name: "MAX.SI.CONJUNTO", syntax: "MAX.SI.CONJUNTO(rango_max; rango1; criterio1; …)", desc: "El valor más alto que cumple las condiciones.", cat: "Estadística" },
  { name: "MIN.SI.CONJUNTO", syntax: "MIN.SI.CONJUNTO(rango_min; rango1; criterio1; …)", desc: "El valor más bajo que cumple las condiciones.", cat: "Estadística" },
  { name: "PRODUCTO", syntax: "PRODUCTO(número1; …)", desc: "Multiplica todos los números.", cat: "Matemáticas" },
  { name: "SUMAPRODUCTO", syntax: "SUMAPRODUCTO(rango1; rango2; …)", desc: "Suma de los productos de rangos.", cat: "Matemáticas" },
  { name: "REDONDEAR", syntax: "REDONDEAR(número; decimales)", desc: "Redondea a los decimales indicados.", cat: "Matemáticas" },
  { name: "REDONDEAR.MAS", syntax: "REDONDEAR.MAS(número; decimales)", desc: "Redondea hacia arriba.", cat: "Matemáticas" },
  { name: "REDONDEAR.MENOS", syntax: "REDONDEAR.MENOS(número; decimales)", desc: "Redondea hacia abajo.", cat: "Matemáticas" },
  { name: "ENTERO", syntax: "ENTERO(número)", desc: "Parte entera de un número.", cat: "Matemáticas" },
  { name: "ABS", syntax: "ABS(número)", desc: "Valor absoluto.", cat: "Matemáticas" },
  { name: "RESIDUO", syntax: "RESIDUO(número; divisor)", desc: "Resto de una división.", cat: "Matemáticas" },
  { name: "POTENCIA", syntax: "POTENCIA(número; potencia)", desc: "Eleva un número a una potencia.", cat: "Matemáticas" },
  { name: "RAIZ", syntax: "RAIZ(número)", desc: "Raíz cuadrada.", cat: "Matemáticas" },
  { name: "ALEATORIO.ENTRE", syntax: "ALEATORIO.ENTRE(inferior; superior)", desc: "Número entero al azar entre dos valores.", cat: "Matemáticas" },
  { name: "PI", syntax: "PI()", desc: "El número π.", cat: "Matemáticas" },
  { name: "SI", syntax: "SI(condición; si_verdadero; [si_falso])", desc: "Devuelve un valor u otro según una condición.", cat: "Lógicas" },
  { name: "SI.CONJUNTO", syntax: "SI.CONJUNTO(condición1; valor1; …)", desc: "Varias condiciones seguidas.", cat: "Lógicas" },
  { name: "SI.ERROR", syntax: "SI.ERROR(valor; si_error)", desc: "Otro valor si hay un error.", cat: "Lógicas" },
  { name: "Y", syntax: "Y(condición1; condición2; …)", desc: "VERDADERO si se cumplen todas.", cat: "Lógicas" },
  { name: "O", syntax: "O(condición1; condición2; …)", desc: "VERDADERO si se cumple alguna.", cat: "Lógicas" },
  { name: "NO", syntax: "NO(condición)", desc: "Invierte VERDADERO y FALSO.", cat: "Lógicas" },
  { name: "ESBLANCO", syntax: "ESBLANCO(valor)", desc: "¿Está vacía la celda?", cat: "Lógicas" },
  { name: "ESNUMERO", syntax: "ESNUMERO(valor)", desc: "¿Es un número?", cat: "Lógicas" },
  { name: "CONCATENAR", syntax: "CONCATENAR(texto1; texto2; …)", desc: "Une varios textos.", cat: "Texto" },
  { name: "UNIRCADENAS", syntax: "UNIRCADENAS(separador; ignorar_vacías; texto1; …)", desc: "Une textos con un separador.", cat: "Texto" },
  { name: "IZQUIERDA", syntax: "IZQUIERDA(texto; [n])", desc: "Los primeros caracteres.", cat: "Texto" },
  { name: "DERECHA", syntax: "DERECHA(texto; [n])", desc: "Los últimos caracteres.", cat: "Texto" },
  { name: "EXTRAE", syntax: "EXTRAE(texto; inicio; n)", desc: "Caracteres del medio.", cat: "Texto" },
  { name: "LARGO", syntax: "LARGO(texto)", desc: "Número de caracteres.", cat: "Texto" },
  { name: "MAYUSC", syntax: "MAYUSC(texto)", desc: "Pasa a mayúsculas.", cat: "Texto" },
  { name: "MINUSC", syntax: "MINUSC(texto)", desc: "Pasa a minúsculas.", cat: "Texto" },
  { name: "NOMPROPIO", syntax: "NOMPROPIO(texto)", desc: "Primera letra de cada palabra en mayúscula.", cat: "Texto" },
  { name: "ESPACIOS", syntax: "ESPACIOS(texto)", desc: "Quita los espacios sobrantes.", cat: "Texto" },
  { name: "SUSTITUIR", syntax: "SUSTITUIR(texto; buscar; reemplazo)", desc: "Cambia un texto por otro.", cat: "Texto" },
  { name: "ENCONTRAR", syntax: "ENCONTRAR(buscar; texto; [inicio])", desc: "Posición de un texto (distingue mayúsculas).", cat: "Texto" },
  { name: "HALLAR", syntax: "HALLAR(buscar; texto; [inicio])", desc: "Posición de un texto.", cat: "Texto" },
  { name: "TEXTO", syntax: "TEXTO(valor; formato)", desc: "Da formato a un número como texto.", cat: "Texto" },
  { name: "VALOR", syntax: "VALOR(texto)", desc: "Convierte un texto en número.", cat: "Texto" },
  { name: "HOY", syntax: "HOY()", desc: "La fecha de hoy.", cat: "Fecha y hora" },
  { name: "AHORA", syntax: "AHORA()", desc: "La fecha y la hora actuales.", cat: "Fecha y hora" },
  { name: "FECHA", syntax: "FECHA(año; mes; día)", desc: "Crea una fecha.", cat: "Fecha y hora" },
  { name: "AÑO", syntax: "AÑO(fecha)", desc: "El año de una fecha.", cat: "Fecha y hora" },
  { name: "MES", syntax: "MES(fecha)", desc: "El mes de una fecha.", cat: "Fecha y hora" },
  { name: "DIA", syntax: "DIA(fecha)", desc: "El día de una fecha.", cat: "Fecha y hora" },
  { name: "DIASEM", syntax: "DIASEM(fecha; [tipo])", desc: "El día de la semana (1-7).", cat: "Fecha y hora" },
  { name: "DIAS", syntax: "DIAS(fecha_final; fecha_inicial)", desc: "Días entre dos fechas.", cat: "Fecha y hora" },
  { name: "FECHA.MES", syntax: "FECHA.MES(fecha; meses)", desc: "Fecha sumando meses.", cat: "Fecha y hora" },
  { name: "FIN.MES", syntax: "FIN.MES(fecha; meses)", desc: "Último día del mes.", cat: "Fecha y hora" },
  { name: "BUSCARV", syntax: "BUSCARV(valor; tabla; columna; [aproximado])", desc: "Busca en la primera columna y devuelve otra columna.", cat: "Búsqueda" },
  { name: "BUSCARH", syntax: "BUSCARH(valor; tabla; fila; [aproximado])", desc: "Busca en la primera fila y devuelve otra fila.", cat: "Búsqueda" },
  { name: "BUSCARX", syntax: "BUSCARX(valor; rango_buscar; rango_devolver; [si_no_está])", desc: "Busca un valor y devuelve el correspondiente.", cat: "Búsqueda" },
  { name: "COINCIDIR", syntax: "COINCIDIR(valor; rango; [tipo])", desc: "Posición de un valor en un rango.", cat: "Búsqueda" },
  { name: "INDICE", syntax: "INDICE(rango; fila; [columna])", desc: "Valor en una posición de un rango.", cat: "Búsqueda" },
  { name: "ELEGIR", syntax: "ELEGIR(índice; valor1; valor2; …)", desc: "Elige un valor de una lista.", cat: "Búsqueda" },
  { name: "PAGO", syntax: "PAGO(tasa; periodos; capital)", desc: "Cuota de un préstamo.", cat: "Financieras" },
  { name: "VF", syntax: "VF(tasa; periodos; pago; [capital])", desc: "Valor futuro de una inversión.", cat: "Financieras" },
  { name: "VA", syntax: "VA(tasa; periodos; pago; [valor_futuro])", desc: "Valor actual de una inversión.", cat: "Financieras" },
];

const norm = (s: string) => s.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Funciones cuyo nombre empieza por lo escrito. */
export function suggestFunctions(prefix: string, max = 8): FnInfo[] {
  const p = norm(prefix);
  if (!p) return [];
  return FN_INFO.filter((f) => norm(f.name).startsWith(p)).slice(0, max);
}
