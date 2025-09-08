const state = {
  professionals: [],
  slots: [],
  appointments: loadAppointments(), // desde localStorage
  profile: loadProfile(), // desde localStorage
};

const els = {
  proSelect: document.getElementById("proSelect"),
  dateSelect: document.getElementById("dateSelect"),
  durationSelect: document.getElementById("durationSelect"),
  loadSlots: document.getElementById("loadSlots"),
  slots: document.getElementById("slots"),
  myAppointments: document.getElementById("myAppointments"),
  patientForm: document.getElementById("patientForm"),
  clearProfile: document.getElementById("clearProfile"),
  patientName: document.getElementById("patientName"),
  patientEmail: document.getElementById("patientEmail"),
  patientPhone: document.getElementById("patientPhone"),
};

init();

async function init(){
  await loadProfessionals();
  hydrateProfileForm();
  hydrateDate();
  wireEvents();
  renderAppointments();
}

function hydrateDate(){
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth()+1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  els.dateSelect.value = `${y}-${m}-${d}`;
}

function wireEvents(){
  els.loadSlots.addEventListener("click", (e)=>{
    e.preventDefault();
    handleLoadSlots();
  });
  els.patientForm.addEventListener("submit", (e)=>{
    e.preventDefault();
    const profile = {
      name: els.patientName.value.trim(),
      email: els.patientEmail.value.trim(),
      phone: els.patientPhone.value.trim(),
    };
    if(!profile.name || !profile.email || !profile.phone){
      return Swal.fire({icon:'warning', title:'Faltan datos', text:'Completá nombre, email y teléfono.'});
    }
    saveProfile(profile);
    Swal.fire({icon:'success', title:'Perfil guardado', timer:1400, showConfirmButton:false});
  });
  els.clearProfile.addEventListener("click", ()=>{
    localStorage.removeItem("turnero_profile");
    state.profile = null;
    els.patientName.value = "";
    els.patientEmail.value = "";
    els.patientPhone.value = "";
    Swal.fire({icon:'info', title:'Perfil eliminado', timer:1200, showConfirmButton:false});
  });
}

async function loadProfessionals(){
  const res = await fetch("data/psychologists.json");
  const pros = await res.json();
  state.professionals = pros;
  els.proSelect.innerHTML = pros.map(p => `<option value="${p.id}">${p.name} — ${p.specialty}</option>`).join("");
}

function hydrateProfileForm(){
  if(state.profile){
    els.patientName.value = state.profile.name || "";
    els.patientEmail.value = state.profile.email || "";
    els.patientPhone.value = state.profile.phone || "";
  }
}

async function handleLoadSlots(){
  const proId = els.proSelect.value;
  const dateStr = els.dateSelect.value;
  const minutes = parseInt(els.durationSelect.value, 10);
  if(!proId || !dateStr){
    return Swal.fire({icon:'warning', title:'Seleccioná profesional y fecha'});
  }
  const pro = state.professionals.find(p=> String(p.id)===String(proId));
  const day = new Date(dateStr + "T00:00:00");
  const weekday = day.getDay(); // 0=Dom
  
  const schedule = pro.schedule.find(s => s.weekday === weekday);
  if(!schedule){
    els.slots.innerHTML = `<p class="muted">No hay atención para ese día.</p>`;
    return;
  }
  
  const slots = generateSlots(dateStr, schedule.start, schedule.end, minutes);
  
  const taken = state.appointments.filter(a => a.proId === pro.id);
  const available = slots.filter(slot => !hasOverlap(slot, taken));
  state.slots = available;
  renderSlots(available, pro, minutes);
}

function generateSlots(isoDate, startHHMM, endHHMM, stepMinutes){
  const [sh, sm] = startHHMM.split(":").map(Number);
  const [eh, em] = endHHMM.split(":").map(Number);
  const start = new Date(`${isoDate}T${String(sh).padStart(2,'0')}:${String(sm).padStart(2,'0')}:00`);
  const end = new Date(`${isoDate}T${String(eh).padStart(2,'0')}:${String(em).padStart(2,'0')}:00`);
  const out = [];
  for(let t = new Date(start); t < end; t = new Date(t.getTime() + stepMinutes*60000)){
    const s = new Date(t);
    const e = new Date(t.getTime() + stepMinutes*60000);
    if(e <= end) out.push({ start: s.toISOString(), end: e.toISOString() });
  }
  return out;
}

function hasOverlap(slot, takenAppointments){
  
  const s = new Date(slot.start).getTime();
  const e = new Date(slot.end).getTime();
  return takenAppointments.some(a => {
    const as = new Date(a.start).getTime();
    const ae = new Date(a.end).getTime();
    return s < ae && e > as; 
  });
}

function renderSlots(slots, pro, minutes){
  if(slots.length === 0){
    els.slots.innerHTML = `<p class="muted">No hay turnos disponibles con la duración seleccionada.</p>`;
    return;
  }
  els.slots.innerHTML = slots.map(s => {
    const t = new Date(s.start);
    const hh = String(t.getHours()).padStart(2,'0');
    const mm = String(t.getMinutes()).padStart(2,'0');
    return `<div class="slot">
      <span class="time">${hh}:${mm} hs</span>
      <button class="book" data-start="${s.start}" data-end="${s.end}" data-pro="${pro.id}" data-min="${minutes}">Reservar</button>
    </div>`;
  }).join("");

  els.slots.querySelectorAll(".book").forEach(btn => {
    btn.addEventListener("click", async () => {
      if(!state.profile){
        return Swal.fire({icon:'info', title:'Guardá tu perfil primero'});
      }
      const proId = Number(btn.dataset.pro);
      const start = btn.dataset.start;
      const end = btn.dataset.end;
      const minutes = Number(btn.dataset.min);
      const pro = state.professionals.find(p => p.id === proId);

      const res = await Swal.fire({
        title: 'Confirmar turno',
        html: `<p><b>${pro.name}</b> — ${pro.specialty}</p>
               <p>${formatDateTime(start)} (${minutes} min)</p>`,
        showCancelButton: true,
        confirmButtonText: 'Confirmar',
        cancelButtonText: 'Cancelar'
      });
      if(res.isConfirmed){
        const appt = {
          id: crypto.randomUUID(),
          proId, proName: pro.name, specialty: pro.specialty,
          patient: state.profile,
          start, end, status: 'confirmado'
        };
        state.appointments.push(appt);
        saveAppointments();
        Swal.fire({icon:'success', title:'Turno reservado', timer:1400, showConfirmButton:false});
        renderAppointments();
        
        handleLoadSlots();
      }
    });
  });
}

function renderAppointments(){
  const list = state.appointments
    .sort((a,b)=> new Date(a.start)-new Date(b.start))
    .map(a =>{
      return `<div class="item" data-id="${a.id}">
        <div>
          <div><b>${a.proName}</b> — ${a.specialty}</div>
          <div class="meta">
            <span>${formatDateTime(a.start)}</span>
            <span>Paciente: ${a.patient?.name ?? ''}</span>
            <span>Estado: ${a.status}</span>
          </div>
        </div>
        <div class="actions">
          <button class="btn" data-action="reschedule">Reprogramar</button>
          <button class="btn" data-action="cancel">Cancelar</button>
        </div>
      </div>`;
    }).join("");

  els.myAppointments.innerHTML = list || `<p class="muted">Aún no tenés turnos reservados.</p>`;

  
  els.myAppointments.querySelectorAll(".item").forEach(node => {
    const id = node.dataset.id;
    node.querySelector('[data-action="cancel"]').addEventListener("click", ()=> handleCancel(id));
    node.querySelector('[data-action="reschedule"]').addEventListener("click", ()=> handleReschedule(id));
  });
}

async function handleCancel(id){
  const appt = state.appointments.find(a=> a.id===id);
  if(!appt) return;
  const r = await Swal.fire({
    icon:'question', title:'¿Cancelar turno?',
    text: `${appt.proName} — ${formatDateTime(appt.start)}`,
    showCancelButton:true, confirmButtonText:'Sí, cancelar', cancelButtonText:'No'
  });
  if(r.isConfirmed){
    appt.status = 'cancelado';
    saveAppointments();
    renderAppointments();
    handleLoadSlots(); 
    Swal.fire({icon:'success', title:'Turno cancelado', timer:1200, showConfirmButton:false});
  }
}

async function handleReschedule(id){
  const appt = state.appointments.find(a=> a.id===id);
  if(!appt) return;

  
  const { value: date } = await Swal.fire({
    title: 'Elegí nueva fecha',
    input: 'date',
    inputValue: appt.start.slice(0,10),
    inputAttributes: { min: todayISO() },
    showCancelButton: true,
    confirmButtonText: 'Buscar turnos'
  });
  if(!date) return;

  
  const pro = state.professionals.find(p=> p.id === appt.proId);
  const schedule = pro.schedule.find(s => s.weekday === new Date(date).getDay());
  if(!schedule) return Swal.fire({icon:'info', title:'No hay atención ese día'});

  const step = Math.round((new Date(appt.end) - new Date(appt.start))/60000);
  const slots = generateSlots(date, schedule.start, schedule.end, step)
    .filter(slot => !hasOverlap(slot, state.appointments.filter(a=> a.proId===pro.id && a.id!==id)));

  if(slots.length===0) return Swal.fire({icon:'info', title:'No hay turnos disponibles'});

  
  const inputOptions = {};
  slots.forEach((s, i)=> inputOptions[s.start] = formatTime(s.start));

  const pick = await Swal.fire({
    title:'Elegí horario',
    input:'select',
    inputOptions,
    inputPlaceholder:'Horarios disponibles',
    showCancelButton:true,
    confirmButtonText:'Reprogramar'
  });
  if(!pick.value) return;

  appt.start = pick.value;
  appt.end = new Date(new Date(pick.value).getTime() + step*60000).toISOString();
  appt.status = 'confirmado';
  saveAppointments();
  renderAppointments();
  handleLoadSlots();
  Swal.fire({icon:'success', title:'Turno reprogramado', timer:1400, showConfirmButton:false});
}


function formatDateTime(iso){
  const d = new Date(iso);
  return d.toLocaleString('es-AR', { dateStyle:'medium', timeStyle:'short' });
}
function formatTime(iso){
  const d = new Date(iso);
  return d.toLocaleTimeString('es-AR',{hour:'2-digit', minute:'2-digit'});
}
function todayISO(){
  const t = new Date();
  const y=t.getFullYear(), m=String(t.getMonth()+1).padStart(2,'0'), d=String(t.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}


function loadAppointments(){
  try{ return JSON.parse(localStorage.getItem('turnero_appts')||'[]'); } catch{ return []; }
}
function saveAppointments(){
  localStorage.setItem('turnero_appts', JSON.stringify(state.appointments));
}
function loadProfile(){
  try{ return JSON.parse(localStorage.getItem('turnero_profile')||'null'); } catch{ return null; }
}
function saveProfile(p){
  state.profile = p;
  localStorage.setItem('turnero_profile', JSON.stringify(p));
}
