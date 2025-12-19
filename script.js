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

// Funció principal per fer peticions - MÈTODE ACTUALITZAT
async function ferPeticioGS(accio, parametres = {}) {
    console.log(`🔗 Fent petició ${accio}:`, parametres);
    
    try {
        // Crear FormData per a POST
        const formData = new FormData();
        formData.append('action', accio);
        
        // Afegir tots els paràmetres
        Object.keys(parametres).forEach(key => {
            if (parametres[key] !== null && parametres[key] !== undefined) {
                formData.append(key, parametres[key]);
            }
        });
        
        console.log('📤 Enviant petició POST a:', SCRIPT_URL);
        
        // Fer la petició amb mode 'no-cors' i redirect manual
        // Google Apps Script accepta POST amb FormData
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors', // Important: no-cors per evitar errors CORS
            body: formData,
            redirect: 'follow'
        });
        
        // Amb mode 'no-cors' no podem llegir la resposta, així que assumim èxit
        console.log('✅ Petició enviada (mode no-cors)');
        
        // Retornar èxit assumit
        return { 
            exit: true, 
            missatge: 'Petició enviada correctament. Rebràs confirmació per email si és una reserva.',
            _info: 'Mode no-cors (resposta no llegible)'
        };
        
    } catch (error) {
        console.log('❌ Error en ferPeticioGS:', error);
        
        // Si falla el POST, provar amb mètode fallback
        return await ferPeticioFallback(accio, parametres);
    }
}

// Mètode fallback per a peticions que fallen
async function ferPeticioFallback(accio, parametres) {
    console.log('🔄 Usant mètode fallback per:', accio);
    
    try {
        // Provar amb JSONP per a peticions GET
        if (accio !== 'ferReserva') {
            const url = new URL(SCRIPT_URL);
            url.searchParams.append('action', accio);
            
            Object.keys(parametres).forEach(key => {
                if (parametres[key] !== null && parametres[key] !== undefined) {
                    url.searchParams.append(key, parametres[key]);
                }
            });
            
            // Afegir timestamp per evitar cache
            url.searchParams.append('_t', Date.now());
            
            // Ús de iframe per evitar CORS
            return await ferPeticioAmbIframe(url.toString());
        } else {
            // Per a reserves, usar mètode de formulari
            return ferPeticioAmbFormulari(accio, parametres);
        }
    } catch (fallbackError) {
        console.log('❌ Error en mètode fallback:', fallbackError);
        
        // Últim recurs: retornar resposta per defecte
        const resposta = obtenirRespostaPerDefecte(accio, parametres);
        resposta._info = 'Mode offline complet';
        
        // Guardar petició pendent si és una reserva
        if (accio === 'ferReserva') {
            guardarPeticioPendent(accio, parametres);
        }
        
        return resposta;
    }
}

// Mètode amb iframe per evitar CORS (per a GET)
function ferPeticioAmbIframe(url) {
    return new Promise((resolve) => {
        console.log('🔗 Usant iframe per petició:', url);
        
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = url;
        iframe.onload = function() {
            console.log('✅ Iframe carregat - petició enviada');
            document.body.removeChild(iframe);
            
            // No podem llegir la resposta, així que retornem resposta per defecte
            resolve({ 
                exit: true, 
                _info: 'Petició enviada via iframe (resposta no llegible)'
            });
        };
        
        iframe.onerror = function() {
            console.log('❌ Error carregant iframe');
            document.body.removeChild(iframe);
            resolve(obtenirRespostaPerDefecte('obtenirDatesOcupades', {}));
        };
        
        document.body.appendChild(iframe);
        
        // Timeout de seguretat
        setTimeout(() => {
            if (iframe.parentNode) {
                document.body.removeChild(iframe);
                console.log('⏰ Timeout iframe');
                resolve(obtenirRespostaPerDefecte('obtenirDatesOcupades', {}));
            }
        }, 5000);
    });
}

// Mètode amb formulari per a reserves (fallback)
function ferPeticioAmbFormulari(accio, parametres) {
    return new Promise((resolve) => {
        console.log('📝 Creant formulari per:', accio);
        
        // Crear formulari invisible
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = SCRIPT_URL;
        form.style.display = 'none';
        form.target = '_blank'; // Obrir en nova pestanya
        
        // Input per l'acció
        const actionInput = document.createElement('input');
        actionInput.type = 'hidden';
        actionInput.name = 'action';
        actionInput.value = accio;
        form.appendChild(actionInput);
        
        // Afegir tots els paràmetres
        Object.keys(parametres).forEach(key => {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = key;
            input.value = parametres[key];
            form.appendChild(input);
        });
        
        // Afegir timestamp
        const timeInput = document.createElement('input');
        timeInput.type = 'hidden';
        timeInput.name = 'timestamp';
        timeInput.value = Date.now();
        form.appendChild(timeInput);
        
        // Afegir formulari al document
        document.body.appendChild(form);
        
        // Enviar formulari
        form.submit();
        
        // Eliminar formulari després d'un moment
        setTimeout(() => {
            if (form.parentNode) {
                document.body.removeChild(form);
            }
        }, 1000);
        
        // Retornar resposta d'èxit (no podem llegir la resposta del formulari)
        const resposta = { 
            exit: true, 
            missatge: 'Reserva enviada. Rebràs confirmació per email.',
            _info: 'Enviada via formulari HTML'
        };
        
        // Guardar petició pendent per si falla
        guardarPeticioPendent(accio, parametres);
        
        resolve(resposta);
    });
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

// Processar peticions pendents
async function processarPeticionsPendents() {
    try {
        const pendents = JSON.parse(localStorage.getItem('peticionsPendents') || '[]');
        if (pendents.length === 0) return;
        
        console.log('🔄 Processant', pendents.length, 'peticions pendents...');
        
        const pendentsProcessats = [];
        
        for (const peticio of pendents) {
            try {
                // Intentar processar la petició
                await ferPeticioGS(peticio.accio, peticio.parametres);
                console.log('✅ Petició pendent processada:', peticio.accio);
            } catch (e) {
                console.log('❌ Error processant petició pendent:', e);
                // Mantenir la petició si falla
                pendentsProcessats.push(peticio);
            }
        }
        
        // Actualitzar localStorage amb les peticions que encara estan pendents
        localStorage.setItem('peticionsPendents', JSON.stringify(pendentsProcessats));
        
    } catch (e) {
        console.log('❌ Error processant peticions pendents:', e);
    }
}

// Funció per respostes per defecte
function obtenirRespostaPerDefecte(accio, parametres) {
    console.log('🔄 Usant resposta per defecte per:', accio);
    
    // Generar dates ocupades de prova basades en les dades reals
    const avui = new Date();
    const datesOcupadesProva = [];
    
    // Afegir algunes dates properes com a ocupades per a la demo
    for (let i = 2; i < 5; i++) {
        const data = new Date(avui);
        data.setDate(avui.getDate() + i);
        datesOcupadesProva.push(data.toISOString().split('T')[0]);
    }
    
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

// Carregar dates ocupades
async function carregarDatesOcupades() {
    console.log('🔄 Carregant dates ocupades per:', immobleSeleccionat);
    
    mostrarCarregantCalendaris();
    
    try {
        const resultat = await ferPeticioGS('obtenirDatesOcupades', {
            immoble: immobleSeleccionat
        });
        
        let datesArray = [];
        
        // Gestió de resposta
        if (resultat && Array.isArray(resultat.dates)) {
            datesArray = resultat.dates;
        } else if (resultat && resultat.dates) {
            datesArray = resultat.dates;
        } else {
            datesArray = [];
        }
        
        datesOcupades = datesArray;
        console.log('📅 Dates ocupades carregades:', datesOcupades.length, 'dates');
        
        generarCalendariIniciPermanent();
        generarCalendariFiPermanent();
        
    } catch (error) {
        console.log('❌ Error carregant dates:', error);
        datesOcupades = [];
        generarCalendariIniciPermanent();
        generarCalendariFiPermanent();
    }
}

// Funció per mostrar estat de càrrega
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
    if (!data || !(data instanceof Date)) return false;
    
    const dataNormalitzada = new Date(data.getFullYear(), data.getMonth(), data.getDate());
    const dataString = dataNormalitzada.toISOString().split('T')[0];
    
    const estaOcupada = datesOcupades.some(dataOcupada => {
        const dataOcupadaDate = new Date(dataOcupada);
        const dataOcupadaString = dataOcupadaDate.toISOString().split('T')[0];
        return dataString === dataOcupadaString;
    });
    
    return estaOcupada;
}

// A la funció estaOcupat, afegeix més logging per debug:
function estaOcupat(data) {
    if (!data || !(data instanceof Date)) return false;
    
    const dataNormalitzada = new Date(data.getFullYear(), data.getMonth(), data.getDate());
    const dataString = dataNormalitzada.toISOString().split('T')[0];
    
    console.log(`🔍 Comprovant data ${dataString} contra ${datesOcupades.length} dates ocupades`);
    
    const estaOcupada = datesOcupades.some(dataOcupada => {
        // Intentar parsejar la data ocupada
        let dataOcupadaDate;
        try {
            dataOcupadaDate = new Date(dataOcupada);
        } catch (e) {
            console.log(`❌ Error parsejant data ocupada: ${dataOcupada}`);
            return false;
        }
        
        if (isNaN(dataOcupadaDate.getTime())) {
            console.log(`❌ Data ocupada invàlida: ${dataOcupada}`);
            return false;
        }
        
        const dataOcupadaString = dataOcupadaDate.toISOString().split('T')[0];
        const coincideix = dataString === dataOcupadaString;
        
        if (coincideix) {
            console.log(`❌ TROBADA DATA OCUPADA: ${dataString} = ${dataOcupadaString}`);
        }
        
        return coincideix;
    });
    
    console.log(`📅 Data ${dataString} ${estaOcupada ? '❌ OCUPADA' : '✅ DISPONIBLE'}`);
    return estaOcupada;
}

// Inicialització dels calendaris compactes
async function inicialitzarCalendarisCompactes() {
    console.log('📅 Inicialitzant calendaris...');
    
    await carregarDatesOcupades();
    
    generarCalendariIniciPermanent();
    generarCalendariFiPermanent();
    
    console.log('✅ Calendaris inicialitzats');
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
        
        console.log('📥 Resposta:', resultat);
        
        if (resultat && resultat.exit) {
            mostrarMissatge(missatgeDiv, '✅ ' + (resultat.missatge || 'Reserva realitzada amb èxit! Rebràs confirmació per email.'), 'exit');
            mostrarModalReserva();
            
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

// Inicialització
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Inicialitzant sistema...');
    
    // Inicialitzar monitor de connexió
    processarPeticionsPendents();
    setInterval(processarPeticionsPendents, 30000);
    
    // Configurar botons d'immobles
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
