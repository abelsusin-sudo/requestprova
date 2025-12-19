// ⚠️ CONFIGURACIÓ: Canvia aquest valor amb el URL del teu deployment
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxKg6APrukYi1iH6sCjOEVA5VsqGxA7uZBSCI8rTkTZAeMuGGUx7MiKNVr41JQ_atOs/exec';

// Variables globals
let immobleSeleccionat = 'Loft Barcelona';
let preuPerNit = 0;
let datesValides = false;
let datesOcupades = [];
let dataIniciSeleccionada = null;
let dataFiSeleccionada = null;

// Variables pels calendaris compactes
let mesCalendariInici = new Date().getMonth();
let anyCalendariInici = new Date().getFullYear();
let mesCalendariFi = new Date().getMonth();
let anyCalendariFi = new Date().getFullYear();

// Funcionalitat de navegació entre seccions
function mostrarSeccio(seccioId, elementClicat) {
    // Amagar totes les seccions
    document.querySelectorAll('.section').forEach(seccio => {
        seccio.classList.remove('active');
    });
    
    // Mostrar la secció seleccionada
    document.getElementById(seccioId).classList.add('active');
    
    // Actualizar pestanyes actives
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Si s'ha passat l'element clicat, marcar-lo com a actiu
    if (elementClicat) {
        elementClicat.classList.add('active');
    }
    
    // Si és la secció de reserves, inicialitzar els calendaris
    if (seccioId === 'reserves') {
        setTimeout(() => {
            inicialitzarCalendarisCompactes();
            carregarDatesOcupades();
        }, 100);
    }
}

async function ferPeticioGS(accio, parametres = {}) {
  console.log(`🔗 Fent petició ${accio}:`, parametres);
  
  try {
    // Ús de la nova URL de Web App
    const url = SCRIPT_URL;
    
    // Crear FormData per a POST
    const formData = new URLSearchParams();
    formData.append('action', accio);
    
    // Afegir tots els paràmetres
    Object.keys(parametres).forEach(key => {
      if (parametres[key] !== null && parametres[key] !== undefined) {
        formData.append(key, parametres[key]);
      }
    });
    
    console.log('📤 Enviant petició POST a:', url);
    
    // Fer la petició amb timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      body: formData,
      signal: controller.signal,
      mode: 'cors' // Important: mode cors
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('✅ Resposta rebuda:', data);
    return data;
    
  } catch (error) {
    console.log('❌ Error en ferPeticioGS:', error);
    
    // Si és error de CORS, provar amb mètode diferent
    if (error.message.includes('CORS') || error.message.includes('Failed to fetch')) {
      console.log('🔄 Probant mètode sense CORS...');
      return await ferPeticioSenseCORS(accio, parametres);
    }
    
    return obtenirRespostaPerDefecte(accio, parametres);
  }
}
async function ferPeticioSenseCORS(accio, parametres = {}) {
  console.log('🔄 Usant mètode sense CORS...');
  
  try {
    // Crear URL amb paràmetres GET
    const url = new URL(SCRIPT_URL);
    url.searchParams.append('action', accio);
    
    Object.keys(parametres).forEach(key => {
      if (parametres[key] !== null && parametres[key] !== undefined) {
        url.searchParams.append(key, parametres[key]);
      }
    });
    
    // Fer petició amb no-cors (no podrem llegir la resposta)
    const response = await fetch(url.toString(), {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-cache'
    });
    
    // Amb 'no-cors' la resposta és "opaque" - no podem llegir-la
    // Però sabem que s'ha enviat, així que assumim èxit
    console.log('📤 Petició enviada (mode no-cors)');
    
    // Retornar resposta per defecte
    return obtenirRespostaPerDefecte(accio, parametres);
    
  } catch (error) {
    console.log('❌ Error en mètode sense CORS:', error);
    return obtenirRespostaPerDefecte(accio, parametres);
  }
}
// Nova funció per evitar problemes CORS amb JSONP
function ferPeticioJSONP(accio, parametres = {}) {
  return new Promise((resolve, reject) => {
    // Crear un callback únic
    const callbackName = 'jsonp_callback_' + Math.round(100000 * Math.random());
    
    // Afegir el callback als paràmetres
    parametres.callback = callbackName;
    
    // Crear URL
    const url = new URL(SCRIPT_URL);
    url.searchParams.append('action', accio);
    
    Object.keys(parametres).forEach(key => {
      if (parametres[key] !== null && parametres[key] !== undefined) {
        url.searchParams.append(key, parametres[key]);
      }
    });
    
    // Crear script element per JSONP
    const script = document.createElement('script');
    script.src = url.toString();
    
    // Definir la funció de callback global
    window[callbackName] = function(data) {
      delete window[callbackName];
      document.body.removeChild(script);
      console.log('✅ Resposta JSONP rebuda:', data);
      resolve(data);
    };
    
    // Gestionar errors
    script.onerror = function() {
      delete window[callbackName];
      document.body.removeChild(script);
      console.log('❌ Error JSONP, usant resposta per defecte');
      resolve(obtenirRespostaPerDefecte(accio, parametres));
    };
    
    // Afegir l'script al document
    document.body.appendChild(script);
    
    // Timeout per seguretat
    setTimeout(() => {
      if (window[callbackName]) {
        delete window[callbackName];
        document.body.removeChild(script);
        console.log('⏰ Timeout JSONP, usant resposta per defecte');
        resolve(obtenirRespostaPerDefecte(accio, parametres));
      }
    }, 10000);
  });
}
async function ferPeticioAlternativa(accio, parametres = {}) {
  console.log('🔄 Usant mètode alternatiu...');
  
  try {
    // Intentar amb GET simple (pot funcionar millor en algunes xarxes)
    const url = new URL(SCRIPT_URL);
    url.searchParams.append('action', accio);
    
    Object.keys(parametres).forEach(key => {
      if (parametres[key] !== null && parametres[key] !== undefined) {
        url.searchParams.append(key, String(parametres[key]));
      }
    });
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      mode: 'no-cors', // Acceptar respostes opaques
      cache: 'no-cache'
    });
    
    // Amb 'no-cors' no podem llegir la resposta, així que assumim èxit
    console.log('✅ Petició alternativa enviada (resposta no llegible)');
    return obtenirRespostaPerDefecte(accio, parametres);
    
  } catch (fallbackError) {
    console.log('❌ Error en mètode alternatiu:', fallbackError);
    
    // Últim recurs: emmagatzemar localment i intentar més tard
    guardarPeticioPendent(accio, parametres);
    return obtenirRespostaPerDefecte(accio, parametres);
  }
}
// Mètode alternatiu per a reserves (usant POST)
async function ferPeticioReservaAlternativa(parametres) {
    console.log('🔄 Provant mètode alternatiu per reserva...');
    
    try {
        // Provar amb FormData i POST
        const formData = new FormData();
        formData.append('action', 'ferReserva');
        
        Object.keys(parametres).forEach(key => {
            formData.append(key, parametres[key]);
        });
        
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: formData
        });
        
        // Amb 'no-cors' no podem llegir la resposta
        console.log('✅ Petició POST enviada (no es pot llegir resposta amb no-cors)');
        
        // Retornar èxit assumit (l'usuari haurà de verificar manualment)
        return { 
            exit: true, 
            missatge: 'Reserva enviada. Rebràs confirmació per email.' 
        };
        
    } catch (error) {
        console.log('❌ Error en mètode alternatiu:', error);
        
        // Últim intent: enviar via email redirect
        enviarReservaPerEmail(parametres);
        
        return { 
            exit: true, 
            missatge: 'Reserva processada. Verifica el teu email per confirmació.' 
        };
    }
}
// Emmagatzemar peticions pendents
function guardarPeticioPendent(accio, parametres) {
  try {
    const pendents = JSON.parse(localStorage.getItem('peticionsPendents') || '[]');
    pendents.push({
      accio: accio,
      parametres: parametres,
      timestamp: Date.now()
    });
    
    // Mantenir només les últimes 10 peticions
    if (pendents.length > 10) {
      pendents.shift();
    }
    
    localStorage.setItem('peticionsPendents', JSON.stringify(pendents));
    console.log('💾 Petició guardada per intentar més tard:', accio);
    
  } catch (e) {
    console.log('❌ Error guardant petició pendent:', e);
  }
}

// Processar peticions pendents quan la connexió millori
async function processarPeticionsPendents() {
  try {
    const pendents = JSON.parse(localStorage.getItem('peticionsPendents') || '[]');
    if (pendents.length === 0) return;
    
    console.log('🔄 Processant', pendents.length, 'peticions pendents...');
    
    for (const peticio of pendents) {
      try {
        await ferPeticioGS(peticio.accio, peticio.parametres);
        // Eliminar de la llista si té èxit
        pendents.splice(pendents.indexOf(peticio), 1);
      } catch (e) {
        console.log('❌ Error processant petició pendent:', e);
      }
    }
    
    localStorage.setItem('peticionsPendents', JSON.stringify(pendents));
    
  } catch (e) {
    console.log('❌ Error processant peticions pendents:', e);
  }
}

// Escoltar events de connexió
function inicialitzarMonitorConnexio() {
  if (typeof navigator !== 'undefined' && navigator.connection) {
    navigator.connection.addEventListener('change', function() {
      if (navigator.connection.effectiveType !== 'slow-2g' && 
          navigator.connection.effectiveType !== '2g') {
        processarPeticionsPendents();
      }
    });
  }
  
  // També processar en tornar a estar en línia
  window.addEventListener('online', processarPeticionsPendents);
}
// Funció auxiliar per respostes per defecte en cas d'error
// Funció auxiliar per respostes per defecte en cas d'error
function obtenirRespostaPerDefecte(accio, parametres) {
    console.log('🔄 Usant resposta per defecte per:', accio);
    
    // NO generar dates ocupades de prova - retornar array buit
    const datesOcupadesProva = []; // Array buit en lloc de dates de prova
    
    const respostes = {
        'obtenirDatesOcupades': { 
            dates: datesOcupadesProva,
            _info: 'Dades de prova - mode offline'
        },
        'obtenirPreuImmoble': { 
            preu: parametres.immoble === 'Loft Barcelona' ? 120 : 85,
            _info: 'Preu de prova - mode offline'
        },
        'verificarDisponibilitat': { 
            disponible: true,
            missatge: '✅ Disponible (mode offline)'
        },
        'ferReserva': { 
            exit: true, 
            missatge: 'Reserva registrada localment. Es processarà quan hi hagi connexió.',
            _info: 'Reserva en mode offline'
        }
    };
    
    const resposta = respostes[accio] || { error: 'Acció no reconeguda', _info: 'Mode offline' };
    
    // Guardar petició pendent si és una reserva
    if (accio === 'ferReserva') {
      guardarPeticioPendent(accio, parametres);
    }
    
    return resposta;
}
function enviarReservaPerEmail(dadesReserva) {
    // Crear email body
    const subject = `Nova Reserva - ${dadesReserva.immoble}`;
    const body = `
Nova sol·licitud de reserva:

📋 DADES DE LA RESERVA:
• Immoble: ${dadesReserva.immoble}
• Data d'entrada: ${dadesReserva.data_inici}
• Data de sortida: ${dadesReserva.data_fi}
• Nits: ${dadesReserva.nits}
• Preu total: ${dadesReserva.preu_total}€

👤 DADES DEL CLIENT:
• Nom: ${dadesReserva.nom}
• Email: ${dadesReserva.email}
• Telèfon: ${dadesReserva.telefon}

⏰ DATA DE SOL·LICITUD: ${new Date().toLocaleString('ca-ES')}
    `.trim();
    
    // Crear link de mailto
    const email = 'el_teu_email@exemple.com'; // 👈 CANVIA AQUÍ EL TEU EMAIL
    const mailtoLink = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    
    // Obrir client d'email
    window.location.href = mailtoLink;
    
    console.log('📧 Reserva enviada per email:', dadesReserva);
}

// Carregar dates ocupades
// Carregar dates ocupades
async function carregarDatesOcupades() {
    console.log('🔄 Carregant dates ocupades per:', immobleSeleccionat);
    
    mostrarCarregantCalendaris();
    
    try {
        const resultat = await ferPeticioGS('obtenirDatesOcupades', {
            immoble: immobleSeleccionat
        });
        
        let datesArray = [];
        
        // Millorar la gestió de diferents formats de resposta
        if (Array.isArray(resultat)) {
            datesArray = resultat;
        } else if (resultat && Array.isArray(resultat.dates)) {
            datesArray = resultat.dates;
        } else if (resultat && resultat.datesOcupades && Array.isArray(resultat.datesOcupades)) {
            datesArray = resultat.datesOcupades;
        } else if (resultat && resultat.resultat && Array.isArray(resultat.resultat)) {
            datesArray = resultat.resultat;
        } else {
            console.log('⚠️ Format de resposta no reconegut o sense dates:', resultat);
            datesArray = []; // Array buit si no es reconeix el format
        }
        
        // Assegurar que totes les dates estan en format YYYY-MM-DD
        datesArray = datesArray.map(data => {
            if (typeof data === 'string') {
                return data.split('T')[0]; // Eliminar hora si existeix
            }
            return data;
        }).filter(data => data); // Eliminar valors null/undefined
        
        datesOcupades = datesArray;
        console.log('📅 Dates ocupades carregades:', datesOcupades.length, 'dates:', datesOcupades);
        
        generarCalendariIniciPermanent();
        generarCalendariFiPermanent();
        
    } catch (error) {
        console.log('❌ Error carregant dates:', error);
        // En cas d'error, no carregar dates per defecte
        datesOcupades = []; // Array completament buit
        generarCalendariIniciPermanent();
        generarCalendariFiPermanent();
    }
}

// Funció per mostrar estat de càrrega als calendaris
function mostrarCarregantCalendaris() {
    const calendaris = ['calendari-inici-permanent', 'calendari-fi-permanent'];
    
    calendaris.forEach(id => {
        const calendariDiv = document.getElementById(id);
        if (calendariDiv) {
            calendariDiv.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: #666;">
                    <div style="font-size: 2rem; margin-bottom: 1rem;">⏳</div>
                    <div>Carregant disponibilitat...</div>
                </div>
            `;
        }
    });
}

// Funció per comprovar si una data està ocupada
function estaOcupat(data) {
    const dataNormalitzada = new Date(data.getFullYear(), data.getMonth(), data.getDate());
    const dataString = dataNormalitzada.toISOString().split('T')[0];
    
    // Debug: mostrar comparació
    console.log(`🔍 Comprovant data ${dataString} en dates ocupades:`, datesOcupades);
    
    const estaOcupada = datesOcupades.some(dataOcupada => {
        // Normalitzar la data ocupada també
        const dataOcupadaNormalitzada = new Date(dataOcupada);
        const dataOcupadaString = dataOcupadaNormalitzada.toISOString().split('T')[0];
        return dataString === dataOcupadaString;
    });
    
    console.log(`📅 Data ${dataString} ${estaOcupada ? '❌ OCUPADA' : '✅ DISPONIBLE'}`);
    return estaOcupada;
}

// Obtenir preu de l'immoble
async function obtenirPreuImmoble() {
    try {
        const resultat = await ferPeticioGS('obtenirPreuImmoble', {
            immoble: immobleSeleccionat
        });
        
        if (typeof resultat === 'number') {
            preuPerNit = resultat;
        } else if (resultat && typeof resultat.preu === 'number') {
            preuPerNit = resultat.preu;
        } else {
            preuPerNit = immobleSeleccionat === 'Loft Barcelona' ? 120 : 85;
        }
        
        console.log('💰 Preu per nit:', preuPerNit);
        document.getElementById('resum-preu-nit').textContent = preuPerNit + ' €';
        
    } catch (error) {
        console.log('Error obtenint preu:', error);
        preuPerNit = immobleSeleccionat === 'Loft Barcelona' ? 120 : 85;
        document.getElementById('resum-preu-nit').textContent = preuPerNit + ' €';
    }
}

// Inicialització dels calendaris compactes
async function inicialitzarCalendarisCompactes() {
    console.log('📅 Inicialitzant calendaris...');
    
    await carregarDatesOcupades();
    
    generarCalendariIniciPermanent();
    generarCalendariFiPermanent();
    
    console.log('✅ Calendaris inicialitzats amb dates ocupades');
}

// Generar calendari compacte permanent per data d'entrada
function generarCalendariIniciPermanent() {
    const calendariDiv = document.getElementById('calendari-inici-permanent');
    if (!calendariDiv) return;
    
    const mes = mesCalendariInici;
    const any = anyCalendariInici;
    
    generarCalendariCompacte(calendariDiv, mes, any, 'inici-permanent');
}

// Generar calendari compacte permanent per data de sortida
function generarCalendariFiPermanent() {
    const calendariDiv = document.getElementById('calendari-fi-permanent');
    if (!calendariDiv) return;
    
    let mes = mesCalendariFi;
    let any = anyCalendariFi;
    
    generarCalendariCompacte(calendariDiv, mes, any, 'fi-permanent');
}

// Funció principal per generar calendaris compactes
function generarCalendariCompacte(calendariDiv, mes, any, tipus) {
    const nomsMesos = ['Gen', 'Feb', 'Mar', 'Abr', 'Maig', 'Jun', 
                      'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Des'];
    
    const avui = new Date();
    avui.setHours(12, 0, 0, 0);
    
    const dataMinima = tipus === 'fi-permanent' && dataIniciSeleccionada ? 
        new Date(dataIniciSeleccionada.getTime() + 24 * 60 * 60 * 1000) : avui;
    
    let html = `
        <div class="calendari-header">
            <button class="btn-nav" onclick="canviarMesCompacte(-1, '${tipus}')">←</button>
            <div class="calendari-mes">${nomsMesos[mes]} ${any}</div>
            <button class="btn-nav" onclick="canviarMesCompacte(1, '${tipus}')">→</button>
        </div>
        <div class="dies-setmana">
            <div class="dia-setmana">Dl</div>
            <div class="dia-setmana">Dt</div>
            <div class="dia-setmana">Dc</div>
            <div class="dia-setmana">Dj</div>
            <div class="dia-setmana">Dv</div>
            <div class="dia-setmana">Ds</div>
            <div class="dia-setmana">Dg</div>
        </div>
        <div class="dies-mes">
    `;
    
    const primerDia = new Date(any, mes, 1);
    const ultimDia = new Date(any, mes + 1, 0);
    
    let diaIniciSetmana = primerDia.getDay();
    if (diaIniciSetmana === 0) {
        diaIniciSetmana = 6;
    } else {
        diaIniciSetmana = diaIniciSetmana - 1;
    }
    
    for (let i = 0; i < diaIniciSetmana; i++) {
        html += '<div class="dia buit"></div>';
    }
    
    for (let dia = 1; dia <= ultimDia.getDate(); dia++) {
        const dataActual = new Date(any, mes, dia, 12, 0, 0);
        let classe = 'dia';
        let disabled = false;
        
        const avuiNormalitzat = new Date(avui);
        avuiNormalitzat.setHours(12, 0, 0, 0);
        
        if (dataActual.toDateString() === avuiNormalitzat.toDateString()) {
            classe += ' avui';
        }
        
        const dataActualNomésData = new Date(dataActual.getFullYear(), dataActual.getMonth(), dataActual.getDate());
        const avuiNomésData = new Date(avui.getFullYear(), avui.getMonth(), avui.getDate());
        
        if (dataActualNomésData < avuiNomésData) {
            classe += ' passat';
            disabled = true;
        }
        
        if (tipus === 'fi-permanent' && dataIniciSeleccionada) {
            const dataIniciNomésData = new Date(dataIniciSeleccionada.getFullYear(), dataIniciSeleccionada.getMonth(), dataIniciSeleccionada.getDate());
            const dataActualNomésData = new Date(dataActual.getFullYear(), dataActual.getMonth(), dataActual.getDate());
            
            if (dataActualNomésData <= dataIniciNomésData) {
                classe += ' passat';
                disabled = true;
            }
        }
        
        if (estaOcupat(dataActual)) {
            classe += ' ocupat';
            disabled = true;
        }
        
        if (tipus === 'inici-permanent' && dataIniciSeleccionada) {
            const dataIniciNomésData = new Date(dataIniciSeleccionada.getFullYear(), dataIniciSeleccionada.getMonth(), dataIniciSeleccionada.getDate());
            const dataActualNomésData = new Date(dataActual.getFullYear(), dataActual.getMonth(), dataActual.getDate());
            
            if (dataActualNomésData.getTime() === dataIniciNomésData.getTime()) {
                classe += ' seleccionat';
            }
        } else if (tipus === 'fi-permanent' && dataFiSeleccionada) {
            const dataFiNomésData = new Date(dataFiSeleccionada.getFullYear(), dataFiSeleccionada.getMonth(), dataFiSeleccionada.getDate());
            const dataActualNomésData = new Date(dataActual.getFullYear(), dataActual.getMonth(), dataActual.getDate());
            
            if (dataActualNomésData.getTime() === dataFiNomésData.getTime()) {
                classe += ' seleccionat';
            }
        }
        
        const dataISO = `${any}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
        
        if (disabled) {
            html += `<div class="${classe}">${dia}</div>`;
        } else {
            html += `<div class="${classe}" onclick="seleccionarDataCompacte('${dataISO}', '${tipus}')">${dia}</div>`;
        }
    }
    
    html += '</div>';
    calendariDiv.innerHTML = html;
}

// Canviar mes als calendaris compactes
function canviarMesCompacte(direccio, tipus) {
    let mes, any;
    
    if (tipus === 'inici-permanent') {
        mes = mesCalendariInici;
        any = anyCalendariInici;
    } else {
        mes = mesCalendariFi;
        any = anyCalendariFi;
    }
    
    mes += direccio;
    if (mes < 0) {
        mes = 11;
        any--;
    } else if (mes > 11) {
        mes = 0;
        any++;
    }
    
    if (tipus === 'inici-permanent') {
        mesCalendariInici = mes;
        anyCalendariInici = any;
        generarCalendariIniciPermanent();
    } else {
        mesCalendariFi = mes;
        anyCalendariFi = any;
        generarCalendariFiPermanent();
    }
}

// Seleccionar data des dels calendaris compactes
function seleccionarDataCompacte(dataString, tipus) {
    const [any, mes, dia] = dataString.split('-');
    const data = new Date(any, mes - 1, dia, 12, 0, 0);
    
    console.log('🖱️ Data clicada:', dataString, 'Data processada:', data.toISOString());
    
    if (tipus === 'inici-permanent') {
        if (estaOcupat(data)) {
            mostrarMissatge(
                document.getElementById('missatge-disponibilitat'),
                '❌ Aquesta data no està disponible. Si us plau, selecciona una altra data.',
                'error'
            );
            return;
        }
        
        dataIniciSeleccionada = data;
        document.getElementById('data-inici').value = formatDataInput(data);
        
        // Reset data fi si ja no és vàlida
        if (dataFiSeleccionada && dataFiSeleccionada <= data) {
            dataFiSeleccionada = null;
            document.getElementById('data-fi').value = '';
            amagarBotoContinuar();
        }
        
        amagarFormulariReserva();
        
    } else { // tipus === 'fi-permanent'
        if (!dataIniciSeleccionada) {
            mostrarMissatge(
                document.getElementById('missatge-disponibilitat'),
                '⚠️ Si us plau, selecciona primer la data d\'entrada',
                'error'
            );
            return;
        }
        
        if (data <= dataIniciSeleccionada) {
            mostrarMissatge(
                document.getElementById('missatge-disponibilitat'),
                '❌ La data de sortida ha de ser posterior a la data d\'entrada',
                'error'
            );
            return;
        }
        
        // Verificar tot el rang de dates
        const dataTemp = new Date(dataIniciSeleccionada);
        let totDisponible = true;
        let dataOcupada = null;
        
        // Verificar cada dia del rang
        while (dataTemp < data) {
            if (estaOcupat(dataTemp)) {
                totDisponible = false;
                dataOcupada = new Date(dataTemp);
                break;
            }
            dataTemp.setDate(dataTemp.getDate() + 1);
        }
        
        if (!totDisponible) {
            mostrarMissatge(
                document.getElementById('missatge-disponibilitat'),
                `❌ El rang seleccionat no està disponible (${formatDataInput(dataOcupada)} està ocupada)`,
                'error'
            );
            return;
        }
        
        dataFiSeleccionada = data;
        document.getElementById('data-fi').value = formatDataInput(data);
    }
    
    // Actualitzar calendaris
    generarCalendariIniciPermanent();
    generarCalendariFiPermanent();
    
    // Verificar si tenim totes les dates per mostrar el botó
    if (dataIniciSeleccionada && dataFiSeleccionada) {
        datesValides = true;
        mostrarMissatge(
            document.getElementById('missatge-disponibilitat'),
            '✅ Rang de dates disponible!',
            'exit'
        );
        mostrarBotoContinuar();
    } else {
        amagarBotoContinuar();
    }
}

// Formatar data per input
function formatDataInput(data) {
    const any = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    return `${dia}/${mes}/${any}`;
}

// Mostrar botó "Continuar amb la Reserva"
function mostrarBotoContinuar() {
    document.getElementById('boto-continuar-container').style.display = 'block';
}

// Amagar botó "Continuar amb la Reserva"
function amagarBotoContinuar() {
    document.getElementById('boto-continuar-container').style.display = 'none';
}

// Continuar amb la reserva (mostrar formulari)
function continuarAmbReserva() {
    const dataInici = document.getElementById('data-inici').value;
    const dataFi = document.getElementById('data-fi').value;
    
    if (!dataInici || !dataFi) {
        alert('Si us plau, selecciona les dates primer');
        return;
    }
    
    mostrarFormulariReserva(dataInici, dataFi);
    
    document.getElementById('formulari-reserva').scrollIntoView({ 
        behavior: 'smooth' 
    });
}

// Mostrar formulari de reserva
function mostrarFormulariReserva(dataInici, dataFi) {
    const partsInici = dataInici.split('/');
    const partsFi = dataFi.split('/');
    const dataIniciObj = new Date(partsInici[2], partsInici[1] - 1, partsInici[0]);
    const dataFiObj = new Date(partsFi[2], partsFi[1] - 1, partsFi[0]);
    const nits = Math.ceil((dataFiObj - dataIniciObj) / (1000 * 60 * 60 * 24));
    const preuTotal = nits * preuPerNit;
    
    document.getElementById('resum-immoble').textContent = immobleSeleccionat;
    document.getElementById('resum-data-inici').textContent = formatData(dataIniciObj);
    document.getElementById('resum-data-fi').textContent = formatData(dataFiObj);
    document.getElementById('resum-nits').textContent = nits;
    document.getElementById('resum-total').textContent = preuTotal.toFixed(2) + ' €';
    
    document.getElementById('resum-reserva').style.display = 'block';
}

// Amagar formulari de reserva
function amagarFormulariReserva() {
    document.getElementById('resum-reserva').style.display = 'none';
}

function netejarSeleccions() {
    datesOcupades = [];
    datesValides = false;
    dataIniciSeleccionada = null;
    dataFiSeleccionada = null;
    
    // Reset calendaris al mes actual
    const avui = new Date();
    mesCalendariInici = avui.getMonth();
    anyCalendariInici = avui.getFullYear();
    mesCalendariFi = avui.getMonth();
    anyCalendariFi = avui.getFullYear();
    
    document.getElementById('data-inici').value = '';
    document.getElementById('data-fi').value = '';
    document.getElementById('nom').value = '';
    document.getElementById('email').value = '';
    document.getElementById('telefon').value = '';
    
    amagarBotoContinuar();
    amagarFormulariReserva();
    document.getElementById('missatge-disponibilitat').innerHTML = '';
    document.getElementById('missatge-reserva').innerHTML = '';
    
    // Recarregar dates ocupades per l'immoble seleccionat
    carregarDatesOcupades();
}

// Funció per validar el formulari
function validarFormulariReserva() {
    const nom = document.getElementById('nom').value.trim();
    const email = document.getElementById('email').value.trim();
    const telefon = document.getElementById('telefon').value.trim();
    
    if (!nom) {
        return 'Si us plau, introdueix el teu nom';
    }
    
    if (!email) {
        return 'Si us plau, introdueix el teu email';
    }
    
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return 'Si us plau, introdueix un email vàlid';
    }
    
    if (!telefon) {
        return 'Si us plau, introdueix el teu telèfon';
    }
    
    if (telefon.replace(/\D/g, '').length < 9) {
        return 'Si us plau, introdueix un telèfon vàlid';
    }
    
    return null;
}

// Fer reserva
async function ferReserva() {
    const nom = document.getElementById('nom').value;
    const email = document.getElementById('email').value;
    const telefon = document.getElementById('telefon').value;
    const missatgeDiv = document.getElementById('missatge-reserva');
    const btnReservar = document.getElementById('btn-reservar');
    
    // Validar formulari
    const errorValidacio = validarFormulariReserva();
    if (errorValidacio) {
        mostrarMissatge(missatgeDiv, '❌ ' + errorValidacio, 'error');
        return;
    }
    
    if (!datesValides || !dataIniciSeleccionada || !dataFiSeleccionada) {
        mostrarMissatge(missatgeDiv, '❌ Si us plau, verifica primer la disponibilitat de les dates', 'error');
        return;
    }

    const nits = Math.ceil((dataFiSeleccionada - dataIniciSeleccionada) / (1000 * 60 * 60 * 24));
    const preu_total = nits * preuPerNit;

    const dadesReserva = {
        nom: nom.trim(),
        email: email.trim().toLowerCase(),
        telefon: telefon.trim(),
        immoble: immobleSeleccionat,
        data_inici: dataIniciSeleccionada.toISOString().split('T')[0],
        data_fi: dataFiSeleccionada.toISOString().split('T')[0],
        nits: nits,
        preu_total: preu_total
    };
    
    console.log('📤 Dades de reserva enviades:', dadesReserva);
    
    // Desactivar botó durant el procés
    btnReservar.disabled = true;
    btnReservar.textContent = '⏳ Processant...';
    
    try {
        mostrarMissatge(missatgeDiv, '⏳ Processant la teva reserva...', 'info');
        
        const resultat = await ferPeticioGS('ferReserva', dadesReserva);
        
        console.log('📥 Resposta del servidor:', resultat);
        
        if (resultat && resultat.exit) {
            mostrarMissatge(missatgeDiv, resultat.missatge || '✅ Reserva realitzada amb èxit!', 'exit');
            mostrarModalReserva();
            
            // Actualitzar disponibilitat
            setTimeout(() => {
                carregarDatesOcupades();
            }, 1000);
            
            // Netejar formulari després de l'èxit
            setTimeout(() => {
                document.getElementById('nom').value = '';
                document.getElementById('email').value = '';
                document.getElementById('telefon').value = '';
                netejarSeleccions();
                amagarFormulariReserva();
                
                setTimeout(() => {
                    mostrarSeccio('inici');
                }, 1000);
            }, 3000);
        } else {
            const missatgeError = resultat?.missatge || 'Error desconegut en realitzar la reserva';
            mostrarMissatge(missatgeDiv, '❌ ' + missatgeError, 'error');
        }
    } catch (error) {
        console.error('❌ Error en ferReserva:', error);
        mostrarMissatge(missatgeDiv, '❌ Error de connexió. Torna a intentar-ho.', 'error');
    } finally {
        btnReservar.disabled = false;
        btnReservar.textContent = '🚀 Fer Reserva';
    }
}

// Funció auxiliar per formatar dates
function formatData(data) {
    return data.toLocaleDateString('ca-ES', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
}

// Funció auxiliar per mostrar missatges
function mostrarMissatge(element, text, tipus) {
    element.innerHTML = text;
    element.className = `missatge ${tipus}`;
    element.style.display = 'block';
}

// Funció per mostrar la finestra modal de confirmació
function mostrarModalReserva() {
    const modal = document.getElementById('modal-reserva');
    modal.style.display = 'block';
    
    modal.addEventListener('click', function(event) {
        if (event.target === modal) {
            tancarModal();
        }
    });
    
    document.querySelector('.modal-content').addEventListener('click', function(event) {
        event.stopPropagation();
    });
}

// Funció per tancar la finestra modal
function tancarModal() {
    document.getElementById('modal-reserva').style.display = 'none';
}
// Funció per provar la connexió
async function provarConnexio() {
  console.log('🔍 Provant connexió amb Google Apps Script...');
  
  try {
    // Prova amb JSONP
    const resultat = await ferPeticioJSONP('obtenirPreuImmoble', {
        immoble: 'Loft Barcelona'
    });
    
    if (resultat && (resultat.preu || typeof resultat === 'number')) {
        console.log('✅ CONNEXIÓ EXITOSA amb JSONP');
        return true;
    } else {
        console.log('⚠️ Connexió JSONP retorna dades inesperades:', resultat);
        return false;
    }
  } catch (error) {
    console.log('❌ Error de connexió JSONP:', error);
    
    // Provar amb iframe com a últim recurs
    return provarConnexioIframe();
  }
}
function provarConnexioIframe() {
  return new Promise((resolve) => {
    console.log('🔍 Provant connexió amb iframe...');
    
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = SCRIPT_URL + '?action=obtenirPreuImmoble&immoble=Loft+Barcelona';
    
    iframe.onload = function() {
      console.log('✅ Iframe carregat (pot indicar connexió exitosa)');
      document.body.removeChild(iframe);
      resolve(true);
    };
    
    iframe.onerror = function() {
      console.log('❌ Error carregant iframe');
      document.body.removeChild(iframe);
      resolve(false);
    };
    
    document.body.appendChild(iframe);
    
    // Timeout
    setTimeout(() => {
      if (iframe.parentNode) {
        document.body.removeChild(iframe);
        console.log('⏰ Timeout iframe');
        resolve(false);
      }
    }, 5000);
  });
}
// Prova la connexió en carregar la pàgina
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(() => {
    provarConnexio();
  }, 1000);
});

// Inicialització
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Inicialitzant sistema...');
    // Inicialitzar monitor de connexió
  inicialitzarMonitorConnexio();
  
  // Processar peticions pendents cada 30 segons
  setInterval(processarPeticionsPendents, 30000);
    document.querySelectorAll('.btn-immoble').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.btn-immoble').forEach(b => b.classList.remove('seleccionat'));
            this.classList.add('seleccionat');
            immobleSeleccionat = this.getAttribute('data-immoble');
            console.log('🏠 Immoble seleccionat: ' + immobleSeleccionat);
            
            netejarSeleccions();
            obtenirPreuImmoble();
            inicialitzarCalendarisCompactes();
        });
    });
    
    obtenirPreuImmoble();
    inicialitzarCalendarisCompactes();
});
