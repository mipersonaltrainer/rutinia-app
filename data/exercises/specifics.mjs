// Technique written for each of these exercises (setup, execution, typical mistakes, a safety note of their own). Every other exercise keeps the general
// guide for its movement pattern (STEPS/ERRORS in scripts/exercise-lib.mjs). `build()` fails if a slug here does not exist, so a rename cannot silently drop one.
// Plain editorial writing in Rutinia's words, still review_status = "draft": a coach or physiotherapist should confirm it (docs/nutricion and docs/REVIEW.md).
// Shape: slug → [instructions, common_errors, extra safety notes].
export const SPECIFICS = {
  "press-de-banca-plano-con-barra": [
    ["Acuéstate con los ojos bajo la barra, pies firmes en el suelo, glúteos y espalda alta apoyados en el banco.", "Agarra la barra un poco más ancha que los hombros, junta las escápulas y mantenlas atrás y abajo.", "Desbloquea la barra y llévala sobre el pecho; baja controlada hasta rozar la parte media del pecho con los antebrazos casi verticales.", "Empuja hacia arriba y ligeramente hacia atrás hasta extender los codos sin bloquearlos de golpe."],
    ["Rebotar la barra en el pecho", "Despegar los glúteos del banco", "Abrir los codos a 90° respecto al tronco"], ["Pide apoyo (spotter) o usa topes cuando cargues cerca de tu máximo."]],
  "press-de-banca-inclinado-con-barra": [
    ["Ajusta el banco entre 30° y 45° y acuéstate con la espalda alta firme y los pies apoyados.", "Agarra la barra algo más ancha que los hombros y junta las escápulas.", "Baja la barra hasta la parte alta del pecho, sin llevarla al cuello, con los codos a unos 45-60° del tronco.", "Empuja hasta extender los codos con la barra sobre los hombros."],
    ["Inclinar el banco más de 45° y convertirlo en un press de hombro", "Llevar la barra al cuello o a la clavícula", "Arquear la zona lumbar para levantar más peso"], ["Usa topes o un asistente: el riesgo de quedar atrapado bajo la barra es real."]],
  "flexiones-estandar": [
    ["Colócate en plancha alta con las manos un poco más abiertas que los hombros y el cuerpo en línea recta de cabeza a talones.", "Aprieta abdomen y glúteos para que la cadera no se hunda ni se eleve.", "Baja el pecho hacia el suelo con los codos a unos 45° del cuerpo, hasta que el pecho quede a un puño del suelo.", "Empuja el suelo y regresa a la posición inicial sin perder la línea del cuerpo."],
    ["Dejar caer la cadera o subirla en forma de pico", "Abrir los codos en cruz", "Mover solo la cabeza sin bajar el pecho"], ["Si no puedes mantener la técnica, apoya las rodillas o las manos en un banco."]],
  "fondos-en-paralelas-inclinado-al-frente": [
    ["Sube a las paralelas con los brazos extendidos y el cuerpo inclinado ligeramente hacia adelante.", "Baja controlado, con los codos algo abiertos, hasta que los hombros queden un poco por debajo de los codos.", "Empuja hasta extender los codos sin encogerte hacia las orejas."],
    ["Bajar más allá de lo que los hombros toleran", "Balancear las piernas para subir", "Encoger los hombros hacia las orejas"], ["Si sientes dolor en la parte delantera del hombro, reduce el rango o cambia por una flexión con lastre o un press."]],
  "aperturas-con-mancuernas-en-banco-plano": [
    ["Acuéstate con una mancuerna en cada mano sobre el pecho, palmas enfrentadas y codos ligeramente flexionados.", "Abre los brazos en arco amplio, manteniendo la leve flexión del codo, hasta sentir estiramiento en el pecho.", "Cierra el arco llevando las mancuernas arriba como si abrazaras un árbol grande."],
    ["Estirar demasiado y exponer el hombro", "Convertir la apertura en un press doblando los codos", "Usar un peso que no puedes controlar"], ["Elige una carga ligera: la posición de máximo estiramiento es exigente para el hombro."]],
  "dominadas-pronas": [
    ["Agarra la barra con las palmas hacia adelante, un poco más ancha que los hombros, y cuelga con los brazos extendidos.", "Activa los dorsales llevando los hombros hacia abajo y atrás antes de subir.", "Sube llevando el pecho hacia la barra hasta que la barbilla la pase.", "Baja controlado hasta la extensión casi completa de los brazos."],
    ["Balancearse con las piernas (kipping) sin entrenarlo", "Subir solo la cabeza sin llevar el pecho", "Soltarse en la bajada sin control"], ["Si aún no logras repeticiones, usa dominadas asistidas con banda o máquina."]],
  "jalon-al-pecho-agarre-ancho": [
    ["Siéntate con los muslos fijos bajo el soporte y agarra la barra más ancha que los hombros.", "Inclina el torso levemente atrás con el pecho alto y baja los hombros antes de tirar.", "Lleva la barra hacia la parte alta del pecho, llevando los codos hacia abajo y atrás.", "Regresa con control hasta estirar los brazos sin que los hombros suban hacia las orejas."],
    ["Tirar de la barra con ayuda del balanceo del tronco", "Llevar la barra detrás de la nuca", "Subir los hombros al soltar"], []],
  "remo-con-barra-inclinado": [
    ["De pie con los pies al ancho de la cadera, flexiona rodillas y cadera hasta inclinar el torso a unos 45° con la espalda neutra.", "Agarra la barra algo más ancha que los hombros con los brazos extendidos.", "Tira de la barra hacia el abdomen bajo llevando los codos atrás, sin impulso.", "Baja controlado manteniendo el torso en el mismo ángulo."],
    ["Redondear la espalda baja", "Subir el torso para ayudarse con el impulso", "Tirar hacia el pecho y encoger los hombros"], ["Si la espalda baja se fatiga antes que la espalda alta, cambia a un remo con apoyo de pecho."]],
  "remo-con-mancuerna-a-una-mano": [
    ["Apoya una mano y la rodilla del mismo lado en un banco; la otra mano sostiene la mancuerna con el brazo estirado.", "Mantén la espalda plana y el torso casi paralelo al suelo.", "Tira de la mancuerna hacia la cadera llevando el codo cerca del cuerpo, sin girar el tronco.", "Baja controlado hasta estirar el dorsal."],
    ["Rotar el torso para subir la mancuerna", "Tirar con el bíceps en vez de con la espalda", "Redondear la espalda"], []],
  "remo-en-polea-baja-agarre-cerrado": [
    ["Siéntate con las rodillas ligeramente flexionadas y la espalda erguida, agarrando el maneral con los brazos estirados.", "Saca el pecho y lleva los hombros abajo y atrás.", "Tira del maneral hacia el abdomen, juntando las escápulas, sin mover el tronco.", "Regresa con control hasta estirar los brazos sin redondear la espalda."],
    ["Balancear el torso adelante y atrás", "Encoger los hombros", "Redondear la espalda al estirar"], []],
  "face-pull-en-polea": [
    ["Ajusta la polea a la altura de la cara con una cuerda y da un paso atrás con los brazos estirados.", "Tira de la cuerda hacia el rostro, abriendo los codos a los lados y llevando las manos a la altura de las orejas.", "Rota los hombros hacia afuera al final del recorrido y regresa controlado."],
    ["Usar demasiado peso y echar el cuerpo atrás", "Tirar hacia el pecho y no hacia la cara", "Encoger los hombros"], ["Es un ejercicio de control: prioriza la técnica sobre la carga."]],
  "press-militar-con-barra-de-pie": [
    ["De pie, pies al ancho de la cadera, agarra la barra a la altura de la clavícula con las manos un poco más anchas que los hombros.", "Aprieta glúteos y abdomen para que la zona lumbar no se arquee.", "Empuja la barra hacia arriba, moviendo la cabeza ligeramente atrás para dejar pasar la barra, y termina con la barra sobre la coronilla y los brazos extendidos.", "Baja controlado hasta la clavícula."],
    ["Arquear la zona lumbar para empujar", "Empujar la barra hacia adelante en vez de en línea recta", "Mirar al techo en exceso"], ["Evítalo o reduce la carga si tienes dolor de hombro o poca movilidad por encima de la cabeza."]],
  "elevaciones-laterales-con-mancuernas": [
    ["De pie, mancuernas a los lados, codos ligeramente flexionados y el torso firme.", "Eleva los brazos hacia los lados hasta la altura de los hombros, como si vertieras agua de una jarra.", "Baja lento hasta la posición inicial sin balancear el cuerpo."],
    ["Usar demasiado peso y balancear el torso", "Subir los brazos por encima de los hombros", "Encoger los hombros hacia las orejas"], []],
  "curl-con-barra-recta-de-pie": [
    ["De pie, agarra la barra con las palmas hacia arriba al ancho de los hombros y los codos pegados al cuerpo.", "Sube la barra flexionando los codos hasta la altura del pecho, sin mover los codos hacia adelante.", "Baja controlado hasta extender casi por completo los brazos."],
    ["Balancear el torso para subir la barra", "Adelantar los codos", "Dejar caer la barra sin control"], ["Si sientes molestia en las muñecas, usa una barra Z."]],
  "curl-martillo": [
    ["De pie con una mancuerna en cada mano y las palmas mirando hacia el cuerpo (agarre neutro).", "Flexiona los codos subiendo las mancuernas sin girar las muñecas, con los codos pegados al tronco.", "Baja controlado hasta extender los brazos."],
    ["Balancear el cuerpo", "Separar los codos del tronco", "Subir los hombros"], []],
  "extension-de-triceps-en-polea-con-cuerda": [
    ["De pie frente a la polea alta, agarra la cuerda con los codos pegados a las costillas y el torso algo inclinado.", "Extiende los codos hacia abajo separando los extremos de la cuerda al final.", "Sube controlado hasta que los antebrazos queden cerca de la horizontal, sin mover los codos."],
    ["Mover los codos hacia adelante y atrás", "Usar el cuerpo para empujar", "No extender del todo el codo"], []],
  "fondos-de-triceps-en-banco": [
    ["Apoya las manos en el borde de un banco detrás de ti, con las piernas estiradas o las rodillas flexionadas según tu nivel.", "Baja flexionando los codos hacia atrás, sin abrirlos, hasta unos 90°.", "Empuja con los tríceps hasta extender los codos."],
    ["Bajar demasiado y cargar el hombro", "Separar los codos hacia los lados", "Alejar la espalda del banco"], ["Si el hombro molesta, sustituye por extensiones de tríceps en polea."]],
  "sentadilla-trasera-con-barra": [
    ["Coloca la barra sobre la parte alta de la espalda (no sobre el cuello), pies al ancho de los hombros y puntas ligeramente abiertas.", "Toma aire, aprieta el abdomen y empieza el movimiento llevando la cadera atrás y abajo.", "Baja hasta la profundidad que tu movilidad permita con la espalda neutra y las rodillas siguiendo la dirección de los pies.", "Sube empujando el suelo con todo el pie, manteniendo el pecho alto."],
    ["Dejar que las rodillas se vayan hacia adentro", "Redondear la zona lumbar al bajar", "Levantar los talones del suelo"], ["Usa un rack con topes de seguridad al trabajar pesado."]],
  "sentadilla-goblet-con-mancuerna": [
    ["Sostén una mancuerna verticalmente contra el pecho con ambas manos, pies al ancho de los hombros.", "Baja llevando la cadera atrás y abajo, con el pecho alto y los codos entre las rodillas.", "Sube empujando el suelo con todo el pie."],
    ["Dejar caer el torso hacia adelante", "Meter las rodillas hacia adentro", "Levantar los talones"], []],
  "sentadilla-con-peso-corporal": [
    ["Pies al ancho de los hombros, puntas ligeramente abiertas, brazos al frente para equilibrarte.", "Lleva la cadera atrás y abajo como si te sentaras, con el pecho alto.", "Baja hasta donde mantengas la espalda neutra y los talones apoyados.", "Sube empujando el suelo con todo el pie."],
    ["Rodillas hacia adentro", "Levantar los talones", "Redondear la espalda baja"], []],
  "prensa-de-piernas-45-grados": [
    ["Siéntate con la espalda y la cadera pegadas al respaldo y los pies en la plataforma al ancho de los hombros.", "Suelta los seguros y baja la plataforma controlada hasta unos 90° de rodilla, sin que la cadera se despegue del asiento.", "Empuja con todo el pie sin bloquear las rodillas al extender."],
    ["Despegar la cadera del asiento al bajar", "Bloquear las rodillas de golpe", "Bajar con las rodillas hacia adentro"], ["Nunca bloquees las rodillas con carga alta y no bajes más allá de donde se redondea tu espalda baja."]],
  "extension-de-cuadriceps-en-maquina": [
    ["Ajusta el respaldo para que las rodillas coincidan con el eje de la máquina y el rodillo quede sobre los tobillos.", "Extiende las rodillas hasta casi estirarlas y mantén un instante.", "Baja lento sin dejar caer el peso."],
    ["Usar impulso para subir", "Bloquear las rodillas con fuerza", "Despegar la cadera del asiento"], ["Si tienes molestia en la rodilla (zona de la rótula), limita el rango y consulta a tu profesional."]],
  "sentadilla-bulgara-con-mancuernas": [
    ["Apoya el empeine de un pie atrás sobre un banco y da un paso largo adelante con el otro.", "Baja flexionando la rodilla delantera con el torso erguido hasta que el muslo quede casi paralelo al suelo.", "Sube empujando con el pie de adelante, sin impulsarte con la pierna de atrás."],
    ["Dar un paso demasiado corto y adelantar la rodilla en exceso", "Inclinar el torso hacia un lado", "Meter la rodilla hacia adentro"], ["Empieza con peso corporal para encontrar el equilibrio."]],
  "zancada-caminando-con-mancuernas": [
    ["De pie con una mancuerna en cada mano, da un paso largo adelante.", "Baja hasta que ambas rodillas formen unos 90°, con el torso erguido.", "Empuja con la pierna delantera y da el siguiente paso, alternando."],
    ["Dar pasos demasiado cortos", "Inclinar el torso hacia adelante", "Dejar que la rodilla delantera se vaya hacia adentro"], ["Hazlo en un espacio libre y con suelo estable."]],
  "zancada-hacia-atras-con-mancuernas": [
    ["De pie con una mancuerna en cada mano, da un paso largo hacia atrás apoyando la punta del pie.", "Baja hasta que ambas rodillas formen unos 90°, con el torso erguido y el peso en el talón delantero.", "Empuja con el pie delantero para volver a la posición inicial."],
    ["Pasos muy cortos", "Inclinar el torso", "Dejar que la rodilla delantera se vaya hacia adentro"], ["Es una opción amable con la rodilla que la zancada hacia adelante."]],
  "step-up-al-cajon-con-mancuernas": [
    ["Frente a un cajón o banco estable, con una mancuerna en cada mano.", "Apoya todo el pie sobre el cajón y sube empujando con esa pierna, sin impulsarte con la de abajo.", "Baja controlado con la misma pierna y repite; cambia de lado."],
    ["Apoyar solo la punta del pie", "Impulsarse con la pierna de abajo", "Dejar caer el cuerpo al bajar"], ["Usa una altura en la que la rodilla no pase de 90° al apoyar."]],
  "peso-muerto-convencional": [
    ["Pies al ancho de la cadera con la barra sobre la mitad del pie; agarra la barra justo por fuera de las piernas.", "Baja la cadera hasta que las espinillas toquen la barra, con el pecho alto y la espalda neutra.", "Empuja el suelo con los pies y sube la barra pegada a las piernas, extendiendo cadera y rodillas a la vez.", "Termina de pie con los glúteos apretados y baja la barra recorriendo el mismo camino."],
    ["Redondear la espalda al despegar", "Alejar la barra del cuerpo", "Tirar con los brazos o hiperextender la espalda al final"], ["Aprende el patrón con un peso ligero o con kettlebell antes de cargar."]],
  "peso-muerto-rumano-con-barra": [
    ["De pie con la barra a la altura de la cadera, pies al ancho de la cadera y rodillas ligeramente flexionadas.", "Lleva la cadera hacia atrás y baja la barra pegada a las piernas, con la espalda neutra.", "Baja hasta sentir el estiramiento en la parte posterior del muslo, normalmente cerca de la rodilla.", "Sube empujando la cadera hacia adelante hasta quedar de pie."],
    ["Redondear la espalda", "Flexionar demasiado las rodillas y convertirlo en sentadilla", "Alejar la barra del cuerpo"], []],
  "peso-muerto-rumano-con-mancuernas": [
    ["De pie con una mancuerna en cada mano frente a los muslos y rodillas ligeramente flexionadas.", "Lleva la cadera atrás y desliza las mancuernas por las piernas, con la espalda neutra.", "Baja hasta sentir el estiramiento en la parte posterior del muslo.", "Sube llevando la cadera hacia adelante."],
    ["Redondear la espalda", "Doblar demasiado las rodillas", "Alejar las mancuernas del cuerpo"], []],
  "curl-femoral-tumbado-en-maquina": [
    ["Acuéstate boca abajo con el rodillo justo sobre los talones y la cadera pegada al banco.", "Flexiona las rodillas llevando los talones hacia los glúteos.", "Baja lento hasta casi extender las rodillas."],
    ["Levantar la cadera del banco", "Usar impulso", "Dejar caer el peso en la bajada"], ["Si notas un tirón brusco en la parte posterior del muslo, detente."]],
  "hip-thrust-con-barra": [
    ["Siéntate en el suelo con la parte baja de la espalda contra un banco y la barra sobre la cadera, protegida con una almohadilla.", "Apoya los pies al ancho de la cadera con las rodillas a unos 90° arriba.", "Empuja con los talones y sube la cadera hasta que torso y muslos formen una línea, con la barbilla recogida.", "Baja controlado sin dejar caer la barra."],
    ["Arquear la zona lumbar al subir", "Empujar con la punta de los pies", "Subir la cadera con la barra rebotando"], []],
  "puente-de-gluteo-con-peso-corporal": [
    ["Acuéstate boca arriba con las rodillas flexionadas y los pies al ancho de la cadera.", "Empuja con los talones y sube la cadera hasta formar una línea de hombros a rodillas.", "Aprieta los glúteos un instante y baja controlado."],
    ["Arquear la espalda baja al subir", "Empujar con la punta de los pies", "Abrir las rodillas hacia los lados"], []],
  "patada-de-gluteo-en-cuadrupedia": [
    ["Apóyate en manos y rodillas con la espalda neutra y el abdomen firme.", "Lleva una pierna hacia atrás y arriba con la rodilla flexionada, empujando con la planta del pie hacia el techo.", "Baja controlado sin apoyar la rodilla y repite; cambia de lado."],
    ["Arquear la espalda baja para subir más", "Rotar la cadera hacia afuera", "Balancear la pierna con impulso"], []],
  "swing-con-kettlebell": [
    ["Pies un poco más abiertos que los hombros; la kettlebell en el suelo, un paso delante de ti.", "Lanza la cadera atrás (bisagra) con la espalda neutra, agarra la pesa y pásala entre las piernas.", "Extiende la cadera con fuerza hasta quedar de pie; la pesa sube hasta el pecho o los hombros por el impulso de la cadera, no de los brazos.", "Deja que la pesa regrese y vuelve a mandar la cadera atrás."],
    ["Levantar la pesa con los brazos", "Hacer una sentadilla en vez de una bisagra", "Hiperextender la espalda al final"], ["Aprende primero la bisagra de cadera (peso muerto con kettlebell)."]],
  "crunch-abdominal": [
    ["Acuéstate boca arriba con las rodillas flexionadas y los pies apoyados; manos cruzadas sobre el pecho o tras las orejas sin jalar el cuello.", "Exhala y levanta los hombros del suelo enrollando el tronco, con la zona lumbar apoyada.", "Baja lento sin soltarte del todo."],
    ["Jalar el cuello con las manos", "Subir demasiado y despegar la espalda baja", "Hacerlo con impulso"], []],
  "plancha-frontal": [
    ["Apóyate en los antebrazos con los codos bajo los hombros y las piernas estiradas, en línea de cabeza a talones.", "Aprieta abdomen y glúteos, empuja el suelo con los antebrazos y respira de forma normal.", "Mantén el tiempo indicado sin dejar caer la cadera."],
    ["Hundir la cadera", "Subir la cadera en pico", "Contener la respiración"], ["Detente si la espalda baja empieza a doler."]],
  "plancha-lateral": [
    ["Acuéstate de lado apoyado en el antebrazo, con el codo bajo el hombro y las piernas juntas.", "Eleva la cadera hasta formar una línea recta de cabeza a pies y mantén.", "Cambia de lado."],
    ["Dejar caer la cadera", "Rotar el pecho hacia adelante o atrás", "Encoger el hombro"], ["Si es difícil, apoya la rodilla de abajo."]],
  "bird-dog": [
    ["Apóyate en manos y rodillas con las manos bajo los hombros y las rodillas bajo la cadera.", "Estira un brazo hacia adelante y la pierna contraria hacia atrás, manteniendo la pelvis nivelada.", "Mantén un instante, regresa y cambia de lado."],
    ["Arquear la espalda baja", "Rotar la cadera", "Mover el ejercicio con rapidez"], []],
  "dead-bug": [
    ["Acuéstate boca arriba con los brazos al techo y las caderas y rodillas a 90°; la zona lumbar contra el suelo.", "Baja un brazo hacia atrás y la pierna contraria hacia adelante sin despegar la espalda baja.", "Regresa y cambia de lado, con respiración controlada."],
    ["Despegar la espalda baja del suelo", "Moverse con rapidez", "Contener la respiración"], []],
  "mountain-climbers": [
    ["Colócate en plancha alta con las manos bajo los hombros y el cuerpo en línea recta.", "Lleva una rodilla hacia el pecho y regresa, alternando con ritmo controlado.", "Mantén la cadera baja y el abdomen firme."],
    ["Subir la cadera en pico", "Rebotar sin control", "Dejar caer la cadera"], ["Baja el ritmo si pierdes la postura."]],
  "burpee": [
    ["De pie, baja las manos al suelo y lleva los pies atrás hasta plancha alta.", "Baja el pecho al suelo o haz una flexión, y regresa a la plancha.", "Salta los pies hacia las manos y salta hacia arriba con los brazos extendidos."],
    ["Hundir la espalda baja en la plancha", "Aterrizar con las rodillas rígidas", "Hacerlo rápido perdiendo la técnica"], ["Quita el salto o la flexión si estás aprendiendo."]],
  "saltos-de-tijera-jumping-jacks": [
    ["De pie con los pies juntos y los brazos a los lados.", "Salta abriendo las piernas y llevando los brazos por encima de la cabeza.", "Salta de nuevo para volver a la posición inicial, con aterrizajes suaves."],
    ["Aterrizar con las rodillas bloqueadas", "Perder el ritmo y la postura", "Encoger los hombros"], ["Si tienes molestias en rodillas o tobillos, hazlo sin saltar (paso lateral)."]],
  "caminata-rapida-al-aire-libre": [
    ["Camina con la espalda erguida, la mirada al frente y los hombros relajados.", "Balancea los brazos de forma natural y da pasos firmes, apoyando primero el talón.", "Elige un ritmo en el que puedas hablar con frases cortas."],
    ["Encorvar la espalda", "Pasos demasiado largos", "Mirar al suelo"], ["Usa calzado adecuado e hidrátate."]],
  "bicicleta-estatica-ritmo-continuo": [
    ["Ajusta el asiento para que la rodilla quede casi estirada en el punto bajo del pedaleo.", "Mantén la espalda recta y las manos relajadas en el manubrio.", "Pedalea a un ritmo constante en el que puedas hablar con frases cortas."],
    ["Asiento demasiado bajo", "Encorvar la espalda", "Agarrar el manubrio con fuerza"], []],
  "caminata-lateral-con-banda": [
    ["Coloca una banda sobre las rodillas o los tobillos y adopta una media sentadilla con los pies al ancho de la cadera.", "Da pasos laterales manteniendo la tensión de la banda y el torso erguido.", "Regresa en la otra dirección con pasos controlados."],
    ["Juntar los pies entre pasos", "Inclinar el torso", "Dejar que las rodillas se vayan hacia adentro"], []],
  "press-de-hombros-en-maquina": [
    ["Ajusta el asiento para que los agarres queden a la altura de los hombros.", "Empuja hacia arriba hasta casi extender los codos, sin encoger los hombros.", "Baja controlado sin dejar caer el peso."],
    ["Arquear la espalda baja", "Bloquear los codos de golpe", "Encoger los hombros"], []],
  "jalon-al-pecho-agarre-cerrado-neutro": [
    ["Siéntate con los muslos fijos y agarra el maneral con las palmas enfrentadas.", "Inclina el torso levemente atrás y baja los hombros.", "Tira del maneral hacia el pecho llevando los codos hacia abajo, cerca del cuerpo.", "Sube controlado hasta estirar los brazos."],
    ["Balancear el tronco", "Subir los hombros al soltar", "Tirar solo con los brazos"], []],
  "superman-isometrico": [
    ["Acuéstate boca abajo con los brazos y las piernas estirados.", "Eleva ligeramente brazos, pecho y piernas del suelo, con la mirada al suelo.", "Mantén el tiempo indicado y baja controlado."],
    ["Mirar hacia arriba y forzar el cuello", "Subir demasiado y comprimir la espalda baja", "Contener la respiración"], []],
  "thruster-con-mancuernas": [
    ["De pie con una mancuerna en cada hombro, pies al ancho de los hombros.", "Baja en sentadilla con el pecho alto y los codos al frente.", "Al subir, aprovecha el impulso de las piernas y empuja las mancuernas sobre la cabeza.", "Baja las mancuernas a los hombros y repite."],
    ["Empujar solo con los hombros sin usar las piernas", "Arquear la espalda baja", "Perder el pecho alto en la sentadilla"], ["Reduce la carga si pierdes la técnica por fatiga."]],
};
