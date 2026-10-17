let data, view = 'overview';
const titles = {overview:'Genel bakış',transactions:'Gelir & gider',contacts:'Müşteri & tedarikçi',invoices:'Fatura kayıtları',accounts:'Kasa & banka'};
const labels = {income:'Gelir',expense:'Gider',customer:'Müşteri',supplier:'Tedarikçi',cash:'Kasa',bank:'Banka',sale:'Satış',purchase:'Alış'};
const format = n => new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(n/100);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const localDate = () => {const d = new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
function notice(message, error=false){const el=document.querySelector('#notice');el.textContent=message;el.className=error?'error':'';}
async function api(promise){const r=await promise;if(!r.ok)throw Error(r.error);return r.data;}
const select = (name,title,options) => `<label>${title}<select name="${name}" required>${options.map(([v,l])=>`<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select></label>`;
const input = (name,title,type='text',value='') => `<label>${title}<input name="${name}" type="${type}" value="${esc(value)}" required maxlength="300" ${name==='amount'?'inputmode="decimal" placeholder="0,00"':''}></label>`;
function rowsTable(headers, rows){return rows.length?`<table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`:'<div class="empty">Henüz kayıt yok. İlk kaydınızı yukarıdan ekleyin.</div>';}
function render(){
 document.querySelector('#title').textContent=titles[view];
 document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
 const income=data.transactions.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0),expense=data.transactions.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
 document.querySelector('#summary').innerHTML=[['Toplam bakiye',income-expense],['Toplam gelir',income],['Toplam gider',expense]].map(([t,n])=>`<div class="card"><span>${t}</span><strong>${format(n)}</strong></div>`).join('');
 let html='';
 if(view==='overview'){
 html=`<div class="panel"><h2>İşletmenizin kayıtları bir arada</h2><p class="intro">${data.contacts.length} cari · ${data.accounts.length} kasa/banka hesabı · ${data.invoices.length} fatura kaydı<br>Başlamak için kasa veya banka hesabınızı ekleyin; ardından gelir ve giderlerinizi kaydedin. Açılış bakiyenizi bir gelir kaydı olarak girebilirsiniz.</p><h2>Son hareketler</h2>${transactionTable(data.transactions.slice(-8).reverse())}</div>`;
 }else{
 let fields='',headers=[],rows=[];
 const del=r=>`<td><button data-delete="${r.id}" aria-label="Kaydı sil">Sil</button></td>`;
 if(view==='contacts'){
 fields=input('name','Cari adı')+select('type','Tür',[['customer','Müşteri'],['supplier','Tedarikçi']]);
 headers=['Cari adı','Tür',''];rows=data.contacts.map(r=>`<tr><td>${esc(r.name)}</td><td>${labels[r.type]}</td>${del(r)}</tr>`);
 }else if(view==='accounts'){
 fields=input('name','Hesap adı')+select('type','Tür',[['cash','Kasa'],['bank','Banka']]);
 headers=['Hesap','Tür','Bakiye',''];rows=data.accounts.map(r=>`<tr><td>${esc(r.name)}</td><td>${labels[r.type]}</td><td>${format(data.transactions.filter(t=>t.accountId===r.id).reduce((s,t)=>s+(t.type==='income'?t.amount:-t.amount),0))}</td>${del(r)}</tr>`);
 }else if(view==='transactions'){
 fields=input('description','Açıklama')+input('amount','Tutar (₺)')+input('date','Tarih','date',localDate())+select('type','İşlem',[['income','Gelir'],['expense','Gider']])+select('accountId','Kasa / banka',[['','Hesap seçin'],...data.accounts.map(a=>[a.id,a.name])]);
 }else if(view==='invoices'){
 fields=input('number','Fatura numarası')+input('description','Açıklama')+input('amount','Vergiler dahil toplam (₺)')+input('date','Fatura tarihi','date',localDate())+select('type','Fatura türü',[['sale','Satış'],['purchase','Alış']])+select('contactId','Cari',[['','Cari seçin'],...data.contacts.map(c=>[c.id,`${c.name} (${labels[c.type]})`])]);
 headers=['Numara / açıklama','Tarih','Cari','Tür','Toplam',''];rows=data.invoices.slice().reverse().map(r=>`<tr><td>${esc(r.number)}<br>${esc(r.description)}</td><td>${esc(r.date)}</td><td>${esc(data.contacts.find(c=>c.id===r.contactId)?.name)}</td><td>${labels[r.type]}</td><td>${format(r.amount)}</td>${del(r)}</tr>`);
 }
 html=`<div class="panel"><h2>Yeni kayıt</h2><form>${fields}<button type="submit">Kaydı ekle +</button></form><h2>Kayıtlar</h2>${view==='transactions'?transactionTable(data.transactions.slice().reverse(),true):rowsTable(headers,rows)}</div>`;
 }
 document.querySelector('#content').innerHTML=html;
 document.querySelector('form')?.addEventListener('submit',async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;try{data=await api(window.accounting.add(view,Object.fromEntries(new FormData(e.target))));notice('Kayıt eklendi.');render();}catch(err){notice(err.message,true);b.disabled=false;}});
 document.querySelectorAll('[data-delete]').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('Bu kayıt silinsin mi?'))return;try{data=await api(window.accounting.remove(view,b.dataset.delete));notice('Kayıt silindi.');render();}catch(err){notice(err.message,true);}}));
}
function transactionTable(rows,remove=false){return rowsTable(['Açıklama','Tarih','Hesap','Tür','Tutar',...(remove?['']:[])],rows.map(r=>`<tr><td>${esc(r.description)}</td><td>${esc(r.date)}</td><td>${esc(data.accounts.find(a=>a.id===r.accountId)?.name)}</td><td>${labels[r.type]}</td><td class="${r.type==='income'?'positive':'negative'}">${r.type==='income'?'+':'−'}${format(r.amount)}</td>${remove?`<td><button data-delete="${r.id}">Sil</button></td>`:''}</tr>`));}
document.querySelectorAll('nav button').forEach(b=>b.addEventListener('click',()=>{view=b.dataset.view;notice('');render();}));
document.querySelector('#backup').addEventListener('click',async()=>{try{const result=await api(window.accounting.backup());if(result)notice(result);}catch(e){notice(e.message,true);}});
document.querySelector('#today').textContent=new Intl.DateTimeFormat('tr-TR',{dateStyle:'long'}).format(new Date());
(async()=>{try{data=await api(window.accounting.read());render();}catch(e){notice(e.message,true);}})();
