# Seguridad

## Informar de una vulnerabilidad en Lumen Office

Si encuentras un fallo de seguridad en la app (por ejemplo, en la apertura de archivos, las actualizaciones, la
activación o el manejo de documentos):

1. **No abras una issue pública.**
2. Usa la opción privada de GitHub: pestaña **Security → Report a vulnerability** de este repositorio.
3. Incluye los pasos para reproducirlo, la versión afectada (Configuración → Acerca de) y el impacto que crees que tiene.

Intentaré responder en un plazo de 7 días y avisarte cuando esté corregido.

## Cómo se protege la app

- **Actualizaciones firmadas:** cada versión se firma con una clave privada que nunca sale del equipo del autor. La
  app solo instala actualizaciones con una firma válida.
- **Claves de activación firmadas** (Ed25519): la app las comprueba sin conexión con la clave pública; no se pueden
  fabricar.
- **Datos en tu equipo:** documentos, notas y ajustes se guardan localmente. La app solo escribe en las carpetas que
  elijas en la ventana de Windows.
- **IA local:** con el motor integrado, los textos no salen del equipo.

## Versiones con soporte

Solo la última versión publicada en **Releases** recibe correcciones de seguridad. La app se actualiza sola.
