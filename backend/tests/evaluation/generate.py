"""Generate fictional layout/OCR fixtures and an independent answer key."""
import json, sys
from pathlib import Path
from io import BytesIO
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from PIL import Image, ImageDraw, ImageFont

out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
manifest = []

def field(label, value, page=1): return {'label':label,'value':value,'page':page}
def qa(question, values=(), pages=(1,), refusal=False, passage=False):
    return {'question':question,'values':list(values),'pages':list(pages),'refusal':refusal,'passage':passage}
def draw(c, rows, values_first=False):
    # Separate draw order from visual row order, and vary font/spacing by fixture.
    positions = []
    for i,row in enumerate(rows):
        cells = row if isinstance(row,list) else [row]
        for col,text in enumerate(cells): positions.append((col,i,str(text)))
    if values_first: positions.sort(key=lambda t:(-t[0],t[1]))
    for col,i,text in positions:
        c.setFont('Helvetica-Bold' if i==0 else 'Helvetica',15 if i==0 else 11)
        c.drawString([48,285,383,484][col],748-i*25,text)
    c.setFont('Helvetica',8); c.drawString(48,35,'Fictional evaluation fixture - no personal or business records')

def digital(name,kind,pages,fields,questions,items=None,values_first=False):
    c=canvas.Canvas(str(out/name),pagesize=(612,792))
    for rows in pages: draw(c,rows,values_first); c.showPage()
    c.save(); manifest.append({'file':name,'type':kind,'pageCount':len(pages),'methods':['text']*len(pages),'fields':fields,'questions':questions,'items':items or []})

rows=['INVOICE',['Invoice No.','EVAL-A104'],['Supplier','Example North Ltd'],['Customer Name','Example Buyer'],['Invoice Date','2026-09-17'],['Payment Due','2026-10-17'],['Phone','+1 202 555 0147'],['Description','Qty','Unit Price','Amount'],['Keyboards','3','USD 40.00','USD 120.00'],['Mouse','2','USD 15.00','USD 30.00'],['Subtotal','USD 150.00'],['Tax (10%)','USD 15.00'],['Grand Total','USD 165.00'],['Payment Terms','Net 30 days']]
digital('invoice-columns.pdf','Invoice',[rows],[field('Invoice Number','EVAL-A104'),field('Vendor / Seller','Example North Ltd'),field('Bill To','Example Buyer'),field('Invoice Date','2026-09-17'),field('Due Date','2026-10-17'),field('Phone','+1 202 555 0147'),field('Subtotal','USD 150.00'),field('Tax','USD 15.00'),field('Tax Rate','10%'),field('Total','USD 165.00'),field('Payment Terms','Net 30 days')],[qa('What is the invoice number?',['EVAL-A104']),qa('Who supplied this invoice?',['Example North Ltd']),qa('Who is the buyer?',['Example Buyer']),qa('When was it issued?',['2026-09-17']),qa('When is payment due?',['2026-10-17']),qa('How much do I owe?',['USD 165.00']),qa('What is the amount before taxes?',['USD 150.00']),qa('How much tax was charged?',['USD 15.00']),qa('What percentage is the tax?',['10%']),qa('How many keyboards did we buy?',['3','Keyboards']),qa('What does one mouse cost?',['USD 15.00','Mouse']),qa('What is the total amount for keyboards?',['USD 120.00','Keyboards']),qa('What is the vendor?',['Example North Ltd']),qa('What is their phone number?',['+1 202 555 0147']),qa('Is this invoice paid?',refusal=True),qa('What is the vendor age?',refusal=True),qa('How many printers are listed?',refusal=True)],items=[{'description':'Keyboards','quantity':'3','unitPrice':'USD 40.00','amount':'USD 120.00','page':1},{'description':'Mouse','quantity':'2','unitPrice':'USD 15.00','amount':'USD 30.00','page':1}],values_first=True)

ledger=[]; fields=[]
for p,(num,date,total) in enumerate([('EVAL-L201','2026-08-01','EUR 88.00'),('EVAL-L202','2026-08-02','EUR 132.00'),('EVAL-L203','2026-08-03','EUR 88.00')],1):
    ledger.append(['INVOICE',f'Invoice Number: {num}',f'Invoice Date: {date}','Vendor: Example Ledger LLC',f'Total Amount Due: {total}'])
    fields += [field('Invoice Number',num,p),field('Invoice Date',date,p),field('Vendor / Seller','Example Ledger LLC',p),field('Total',total,p)]
digital('invoices-three-pages.pdf','Invoice',ledger,fields,[qa('List invoice numbers',['EVAL-L201','EVAL-L202','EVAL-L203'],[1,2,3]),qa('How many invoices are there?',['3'],[1,2,3]),qa('What are all the dates?',['2026-08-01','2026-08-02','2026-08-03'],[1,2,3]),qa('What is the total on page 2?',['EUR 132.00'],[2]),qa('And on page 3?',['EUR 88.00'],[3]),qa('And its invoice number?',['EVAL-L203'],[3]),qa('What is the total on page 99?',refusal=True),qa('What about the other one?',refusal=True)])

digital('receipt-payment.pdf','Receipt',[['RECEIPT','Receipt Number: EVAL-R017','Store: Example Corner Store','Date: 2026-09-22','Subtotal: GBP 20.00','VAT (20%): GBP 4.00','Total: GBP 24.00','Payment Method: Cash','Amount Paid: GBP 30.00','Change: GBP 6.00']], [field('Receipt Number','EVAL-R017'),field('Store','Example Corner Store'),field('Date','2026-09-22'),field('Subtotal','GBP 20.00'),field('Tax','GBP 4.00'),field('Tax Rate','20%'),field('Total','GBP 24.00'),field('Payment Method','Cash'),field('Amount Paid','GBP 30.00'),field('Change','GBP 6.00')], [qa('What is the receipt number?',['EVAL-R017']),qa('Which store issued the receipt?',['Example Corner Store']),qa('What was the total?',['GBP 24.00']),qa('How much did the customer pay?',['GBP 30.00']),qa('How did they pay?',['Cash']),qa('How much change was returned?',['GBP 6.00']),qa('What was the VAT amount?',['GBP 4.00']),qa('What was the VAT percentage?',['20%']),qa('Who paid?',refusal=True)])

digital('application-form.pdf','Form',[['APPLICATION FORM','Full Name: Example Applicant','Date of Birth: 1994-05-12','Date: 2026-09-05','Email Address: applicant@example.test','Telephone: +1 202 555 0188','Application Number: APP-047','Preferred Language: English','Signature: Example Applicant']], [field('Name','Example Applicant'),field('Date of Birth','1994-05-12'),field('Date','2026-09-05'),field('Email','applicant@example.test'),field('Phone','+1 202 555 0188'),field('Application Number','APP-047'),field('Preferred Language','English')], [qa('Who is the applicant?',['Example Applicant']),qa('When were they born?',['1994-05-12']),qa('What is the submission date?',['2026-09-05']),qa('What is the email address?',['applicant@example.test']),qa('What is the application number?',['APP-047']),qa('Which language do they prefer?',['English']),qa('What is their salary?',refusal=True)])

digital('service-contract.pdf','Contract',[['SERVICE AGREEMENT','Effective Date: 2026-09-01','Parties: Example Provider and Example Client','Support Hours: Monday to Friday, 09:00 to 17:00 UTC','Warranty covers manufacturing defects for twelve months.','Termination requires thirty days written notice.','Delivery takes five business days after approval.']], [field('Effective Date','2026-09-01'),field('Parties','Example Provider and Example Client'),field('Support Hours','Monday to Friday, 09:00 to 17:00 UTC')], [qa('What is the effective date?',['2026-09-01']),qa('Who are the parties?',['Example Provider','Example Client']),qa('What are the support hours?',['09:00','17:00']),qa('What does the warranty cover?',['manufacturing defects'],passage=True),qa('How long is the warranty?',['twelve months'],passage=True),qa('What notice is required for termination?',['thirty days'],passage=True),qa('What is the delivery time?',['five business days'],passage=True),qa('Can this agreement be renewed automatically?',refusal=True)])

digital('shipment-columns.pdf','Unknown',[[ 'SHIPMENT RECORD',['Tracking Code','TRK-0281'],['Destination','Example Harbor'],['Carrier','Example Freight'],['Dispatch Date','2026-09-13'],['Package Count','4'],['Storage Condition','Keep dry']]], [field('Tracking Code','TRK-0281'),field('Destination','Example Harbor'),field('Carrier','Example Freight'),field('Dispatch Date','2026-09-13'),field('Package Count','4'),field('Storage Condition','Keep dry')], [qa('What is the tracking code?',['TRK-0281']),qa('Where is the destination?',['Example Harbor']),qa('Who is the carrier?',['Example Freight']),qa('When was it dispatched?',['2026-09-13']),qa('How many packages?',['4']),qa('What are the storage conditions?',['Keep dry']),qa('What is the total weight?',refusal=True)])

scan_rows=['INVOICE','Invoice Number: EVAL-S301','Vendor: Example Scan Ltd','Invoice Date: 2026-09-24','Subtotal: INR 200.00','Tax: INR 36.00','Grand Total: INR 236.00','Payment Method: Bank Transfer']
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',36)
img=Image.new('RGB',(1600,1800),'white'); d=ImageDraw.Draw(img)
for i,text in enumerate(scan_rows): d.text((80,90+i*100),text,font=font,fill='black')
img.save(out/'invoice-scan.png');img.save(out/'invoice-scan.jpg',quality=90)
scan_fields=[field('Invoice Number','EVAL-S301'),field('Vendor / Seller','Example Scan Ltd'),field('Invoice Date','2026-09-24'),field('Subtotal','INR 200.00'),field('Tax','INR 36.00'),field('Total','INR 236.00'),field('Payment Method','Bank Transfer')]
scan_questions=[qa('What is the invoice number?',['EVAL-S301']),qa('What is the total amount?',['INR 236.00']),qa('What is the tax?',['INR 36.00']),qa('What is the payment method?',['Bank Transfer']),qa('Who supplied the invoice?',['Example Scan Ltd']),qa('What is the payment status?',refusal=True)]
for name,picture in [('invoice-scanned.pdf',img),('invoice-rotated.pdf',img.rotate(90,expand=True))]:
    c=canvas.Canvas(str(out/name),pagesize=(612,792));c.drawImage(ImageReader(picture),0,0,612,792);c.showPage();c.save()
    manifest.append({'file':name,'type':'Invoice','pageCount':1,'methods':['ocr'],'fields':scan_fields,'questions':scan_questions,'items':[]})
c=canvas.Canvas(str(out/'invoice-mixed.pdf'),pagesize=(612,792));draw(c,['INVOICE','Invoice Number: EVAL-M401','Invoice Date: 2026-09-01','Vendor: Example Digital Ltd','Total: INR 100.00']);c.showPage();c.drawImage(ImageReader(img),0,0,612,792);c.showPage();c.save()
manifest.append({'file':'invoice-mixed.pdf','type':'Invoice','pageCount':2,'methods':['text','ocr'],'fields':[field('Invoice Number','EVAL-M401'),field('Total','INR 100.00')]+[dict(f,page=2) for f in scan_fields],'questions':[qa('What is the invoice number on page 1?',['EVAL-M401'],[1]),qa('What is the total on page 2?',['INR 236.00'],[2]),qa('What is the vendor on page 2?',['Example Scan Ltd'],[2]),qa('What are the invoice numbers?',['EVAL-M401','EVAL-S301'],[1,2]),qa('What is the tax on page 1?',refusal=True)],'items':[]})
(out/'broken.pdf').write_bytes(b'%PDF-1.4\ninvalid fixture')
(out/'unsupported.txt').write_text('Unsupported upload fixture')
(out/'manifest.json').write_text(json.dumps({'version':1,'scope':'synthetic held-out layouts; all identities fictional','documents':manifest},indent=2))
print(f'Created {len(manifest)} PDFs; {sum(len(d["questions"]) for d in manifest)} questions; {sum(len(d["fields"]) for d in manifest)} expected fields in {out}')
