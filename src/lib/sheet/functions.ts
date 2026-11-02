import { L } from "@/lib/i18n";
/* Funciones con su nombre en español, para el asistente y el autocompletado. */

export interface FnInfo {
  name: string;
  syntax: string;
  desc: string;
  cat: "Matemáticas" | "Estadística" | "Lógicas" | "Texto" | "Fecha y hora" | "Búsqueda" | "Financieras";
}

export const FN_INFO: FnInfo[] = [
  { name: "SUMA", syntax: "SUMA(número1; [número2]; …)", desc: L("Suma todos los números de un rango."), cat: "Matemáticas" },
  { name: "PROMEDIO", syntax: "PROMEDIO(número1; [número2]; …)", desc: L("Media aritmética de los números."), cat: "Estadística" },
  { name: "CONTAR", syntax: "CONTAR(valor1; [valor2]; …)", desc: L("Cuenta las celdas que contienen números."), cat: "Estadística" },
  { name: "CONTARA", syntax: "CONTARA(valor1; [valor2]; …)", desc: L("Cuenta las celdas que no están vacías."), cat: "Estadística" },
  { name: "CONTAR.BLANCO", syntax: "CONTAR.BLANCO(rango)", desc: L("Cuenta las celdas vacías."), cat: "Estadística" },
  { name: "MAX", syntax: "MAX(número1; [número2]; …)", desc: L("El valor más alto."), cat: "Estadística" },
  { name: "MIN", syntax: "MIN(número1; [número2]; …)", desc: L("El valor más bajo."), cat: "Estadística" },
  { name: "MEDIANA", syntax: "MEDIANA(número1; …)", desc: L("El valor central de los números."), cat: "Estadística" },
  { name: "MODA", syntax: "MODA(número1; …)", desc: L("El valor que más se repite."), cat: "Estadística" },
  { name: "DESVEST", syntax: "DESVEST(número1; …)", desc: L("Desviación estándar de una muestra."), cat: "Estadística" },
  { name: "K.ESIMO.MAYOR", syntax: "K.ESIMO.MAYOR(rango; k)", desc: L("El k-ésimo valor más alto."), cat: "Estadística" },
  { name: "K.ESIMO.MENOR", syntax: "K.ESIMO.MENOR(rango; k)", desc: L("El k-ésimo valor más bajo."), cat: "Estadística" },
  { name: "JERARQUIA", syntax: "JERARQUIA(número; rango; [orden])", desc: L("Posición de un número en una lista."), cat: "Estadística" },
  { name: "SUMAR.SI", syntax: "SUMAR.SI(rango; criterio; [rango_suma])", desc: L("Suma las celdas que cumplen una condición."), cat: "Matemáticas" },
  { name: "SUMAR.SI.CONJUNTO", syntax: "SUMAR.SI.CONJUNTO(rango_suma; rango1; criterio1; …)", desc: L("Suma con varias condiciones."), cat: "Matemáticas" },
  { name: "CONTAR.SI", syntax: "CONTAR.SI(rango; criterio)", desc: L("Cuenta las celdas que cumplen una condición."), cat: "Estadística" },
  { name: "CONTAR.SI.CONJUNTO", syntax: "CONTAR.SI.CONJUNTO(rango1; criterio1; …)", desc: L("Cuenta con varias condiciones."), cat: "Estadística" },
  { name: "PROMEDIO.SI", syntax: "PROMEDIO.SI(rango; criterio; [rango_promedio])", desc: L("Media de las celdas que cumplen una condición."), cat: "Estadística" },
  { name: "PROMEDIO.SI.CONJUNTO", syntax: "PROMEDIO.SI.CONJUNTO(rango_promedio; rango1; criterio1; …)", desc: L("Media con varias condiciones."), cat: "Estadística" },
  { name: "MAX.SI.CONJUNTO", syntax: "MAX.SI.CONJUNTO(rango_max; rango1; criterio1; …)", desc: L("El valor más alto que cumple las condiciones."), cat: "Estadística" },
  { name: "MIN.SI.CONJUNTO", syntax: "MIN.SI.CONJUNTO(rango_min; rango1; criterio1; …)", desc: L("El valor más bajo que cumple las condiciones."), cat: "Estadística" },
  { name: "PRODUCTO", syntax: "PRODUCTO(número1; …)", desc: L("Multiplica todos los números."), cat: "Matemáticas" },
  { name: "SUMAPRODUCTO", syntax: "SUMAPRODUCTO(rango1; rango2; …)", desc: L("Suma de los productos de rangos."), cat: "Matemáticas" },
  { name: "REDONDEAR", syntax: "REDONDEAR(número; decimales)", desc: L("Redondea a los decimales indicados."), cat: "Matemáticas" },
  { name: "REDONDEAR.MAS", syntax: "REDONDEAR.MAS(número; decimales)", desc: L("Redondea hacia arriba."), cat: "Matemáticas" },
  { name: "REDONDEAR.MENOS", syntax: "REDONDEAR.MENOS(número; decimales)", desc: L("Redondea hacia abajo."), cat: "Matemáticas" },
  { name: "ENTERO", syntax: "ENTERO(número)", desc: L("Parte entera de un número."), cat: "Matemáticas" },
  { name: "ABS", syntax: "ABS(número)", desc: L("Valor absoluto."), cat: "Matemáticas" },
  { name: "RESIDUO", syntax: "RESIDUO(número; divisor)", desc: L("Resto de una división."), cat: "Matemáticas" },
  { name: "POTENCIA", syntax: "POTENCIA(número; potencia)", desc: L("Eleva un número a una potencia."), cat: "Matemáticas" },
  { name: "RAIZ", syntax: "RAIZ(número)", desc: L("Raíz cuadrada."), cat: "Matemáticas" },
  { name: "ALEATORIO.ENTRE", syntax: "ALEATORIO.ENTRE(inferior; superior)", desc: L("Número entero al azar entre dos valores."), cat: "Matemáticas" },
  { name: "PI", syntax: "PI()", desc: L("El número π."), cat: "Matemáticas" },
  { name: "SI", syntax: "SI(condición; si_verdadero; [si_falso])", desc: L("Devuelve un valor u otro según una condición."), cat: "Lógicas" },
  { name: "SI.CONJUNTO", syntax: "SI.CONJUNTO(condición1; valor1; …)", desc: L("Varias condiciones seguidas."), cat: "Lógicas" },
  { name: "SI.ERROR", syntax: "SI.ERROR(valor; si_error)", desc: L("Otro valor si hay un error."), cat: "Lógicas" },
  { name: "Y", syntax: "Y(condición1; condición2; …)", desc: L("VERDADERO si se cumplen todas."), cat: "Lógicas" },
  { name: "O", syntax: "O(condición1; condición2; …)", desc: L("VERDADERO si se cumple alguna."), cat: "Lógicas" },
  { name: "NO", syntax: "NO(condición)", desc: L("Invierte VERDADERO y FALSO."), cat: "Lógicas" },
  { name: "ESBLANCO", syntax: "ESBLANCO(valor)", desc: L("¿Está vacía la celda?"), cat: "Lógicas" },
  { name: "ESNUMERO", syntax: "ESNUMERO(valor)", desc: L("¿Es un número?"), cat: "Lógicas" },
  { name: "CONCATENAR", syntax: "CONCATENAR(texto1; texto2; …)", desc: L("Une varios textos."), cat: "Texto" },
  { name: "UNIRCADENAS", syntax: "UNIRCADENAS(separador; ignorar_vacías; texto1; …)", desc: L("Une textos con un separador."), cat: "Texto" },
  { name: "IZQUIERDA", syntax: "IZQUIERDA(texto; [n])", desc: L("Los primeros caracteres."), cat: "Texto" },
  { name: "DERECHA", syntax: "DERECHA(texto; [n])", desc: L("Los últimos caracteres."), cat: "Texto" },
  { name: "EXTRAE", syntax: "EXTRAE(texto; inicio; n)", desc: L("Caracteres del medio."), cat: "Texto" },
  { name: "LARGO", syntax: "LARGO(texto)", desc: L("Número de caracteres."), cat: "Texto" },
  { name: "MAYUSC", syntax: "MAYUSC(texto)", desc: L("Pasa a mayúsculas."), cat: "Texto" },
  { name: "MINUSC", syntax: "MINUSC(texto)", desc: L("Pasa a minúsculas."), cat: "Texto" },
  { name: "NOMPROPIO", syntax: "NOMPROPIO(texto)", desc: L("Primera letra de cada palabra en mayúscula."), cat: "Texto" },
  { name: "ESPACIOS", syntax: "ESPACIOS(texto)", desc: L("Quita los espacios sobrantes."), cat: "Texto" },
  { name: "SUSTITUIR", syntax: "SUSTITUIR(texto; buscar; reemplazo)", desc: L("Cambia un texto por otro."), cat: "Texto" },
  { name: "ENCONTRAR", syntax: "ENCONTRAR(buscar; texto; [inicio])", desc: L("Posición de un texto (distingue mayúsculas)."), cat: "Texto" },
  { name: "HALLAR", syntax: "HALLAR(buscar; texto; [inicio])", desc: L("Posición de un texto."), cat: "Texto" },
  { name: "TEXTO", syntax: "TEXTO(valor; formato)", desc: L("Da formato a un número como texto."), cat: "Texto" },
  { name: "VALOR", syntax: "VALOR(texto)", desc: L("Convierte un texto en número."), cat: "Texto" },
  { name: "HOY", syntax: "HOY()", desc: L("La fecha de hoy."), cat: "Fecha y hora" },
  { name: "AHORA", syntax: "AHORA()", desc: L("La fecha y la hora actuales."), cat: "Fecha y hora" },
  { name: "FECHA", syntax: "FECHA(año; mes; día)", desc: L("Crea una fecha."), cat: "Fecha y hora" },
  { name: "AÑO", syntax: "AÑO(fecha)", desc: L("El año de una fecha."), cat: "Fecha y hora" },
  { name: "MES", syntax: "MES(fecha)", desc: L("El mes de una fecha."), cat: "Fecha y hora" },
  { name: "DIA", syntax: "DIA(fecha)", desc: L("El día de una fecha."), cat: "Fecha y hora" },
  { name: "DIASEM", syntax: "DIASEM(fecha; [tipo])", desc: L("El día de la semana (1-7)."), cat: "Fecha y hora" },
  { name: "DIAS", syntax: "DIAS(fecha_final; fecha_inicial)", desc: L("Días entre dos fechas."), cat: "Fecha y hora" },
  { name: "FECHA.MES", syntax: "FECHA.MES(fecha; meses)", desc: L("Fecha sumando meses."), cat: "Fecha y hora" },
  { name: "FIN.MES", syntax: "FIN.MES(fecha; meses)", desc: L("Último día del mes."), cat: "Fecha y hora" },
  { name: "BUSCARV", syntax: "BUSCARV(valor; tabla; columna; [aproximado])", desc: L("Busca en la primera columna y devuelve otra columna."), cat: "Búsqueda" },
  { name: "BUSCARH", syntax: "BUSCARH(valor; tabla; fila; [aproximado])", desc: L("Busca en la primera fila y devuelve otra fila."), cat: "Búsqueda" },
  { name: "BUSCARX", syntax: "BUSCARX(valor; rango_buscar; rango_devolver; [si_no_está])", desc: L("Busca un valor y devuelve el correspondiente."), cat: "Búsqueda" },
  { name: "COINCIDIR", syntax: "COINCIDIR(valor; rango; [tipo])", desc: L("Posición de un valor en un rango."), cat: "Búsqueda" },
  { name: "INDICE", syntax: "INDICE(rango; fila; [columna])", desc: L("Valor en una posición de un rango."), cat: "Búsqueda" },
  { name: "ELEGIR", syntax: "ELEGIR(índice; valor1; valor2; …)", desc: L("Elige un valor de una lista."), cat: "Búsqueda" },
  { name: "PAGO", syntax: "PAGO(tasa; periodos; capital)", desc: L("Cuota de un préstamo."), cat: "Financieras" },
  { name: "VF", syntax: "VF(tasa; periodos; pago; [capital])", desc: L("Valor futuro de una inversión."), cat: "Financieras" },
  { name: "VA", syntax: "VA(tasa; periodos; pago; [valor_futuro])", desc: L("Valor actual de una inversión."), cat: "Financieras" },
];

const norm = (s: string) => s.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Funciones cuyo nombre empieza por lo escrito. */
export function suggestFunctions(prefix: string, max = 8): FnInfo[] {
  const p = norm(prefix);
  if (!p) return [];
  return FN_INFO.filter((f) => norm(f.name).startsWith(p)).slice(0, max);
}
