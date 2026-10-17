const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {Store,money}=require('../src/store');
function setup(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'muhasebe-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return new Store(path.join(dir,'data.json'));}
test('Kuruş hesabı yuvarlama kaybı olmadan çalışır',()=>{assert.equal(money('12,34'),1234);assert.equal(money('0.29'),29);for(const n of ['-1','0','1.123','abc','Infinity'])assert.throws(()=>money(n));});
test('Kayıtlar diske yazılır ve yeniden açılır',t=>{const s=setup(t);s.add('accounts',{name:'Ana kasa',type:'cash'});s.add('transactions',{description:'Tahsilat',amount:'100,15',date:'2026-10-17',type:'income',accountId:s.data.accounts[0].id});assert.equal(new Store(s.file).data.transactions[0].amount,10015);assert.throws(()=>s.remove('accounts',s.data.accounts[0].id));s.remove('transactions',s.data.transactions[0].id);s.remove('accounts',s.data.accounts[0].id);assert.equal(s.data.accounts.length,0);});
test('Geçersiz tarih ve hesap bakiyeyi değiştirmez',t=>{const s=setup(t);s.add('accounts',{name:'Banka',type:'bank'});const row={description:'Ödeme',amount:'25',date:'2026-02-30',type:'expense',accountId:s.data.accounts[0].id};assert.throws(()=>s.add('transactions',row));assert.throws(()=>s.add('transactions',{...row,date:'2026-10-17',accountId:'missing'}));assert.equal(s.data.transactions.length,0);});
test('Fatura cari türü, mükerrer numara ve bağlı cari silme denetlenir',t=>{const s=setup(t);s.add('contacts',{name:'Müşteri',type:'customer'});const row={number:'SAT-1',description:'Hizmet',amount:'120',date:'2026-10-17',type:'sale',contactId:s.data.contacts[0].id};s.add('invoices',row);assert.throws(()=>s.add('invoices',row));assert.throws(()=>s.add('invoices',{...row,type:'purchase'}));assert.throws(()=>s.remove('contacts',row.contactId));assert.equal(s.data.transactions.length,0);});
test('Bozuk dosya sessizce sıfırlanmaz',t=>{const s=setup(t);fs.writeFileSync(s.file,'broken');assert.throws(()=>new Store(s.file));assert.equal(fs.readFileSync(s.file,'utf8'),'broken');});
