const invoice = (d) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body,
    html {
      font-family: 'Helvetica';
      font-size: 12px;
    }
    img {
      margin: 10px;
      width: 170px;
    }
    h1 {
      text-align: center;
    }
    p {
      padding: 0px 0px;
      margin: 5px;
    }
    table.border {
      border-collapse: collapse;
    }
    table.border td,
    table th {
      padding: 4px 10px;
      border: 1px solid #000;
    }
    .clear {
      clear: both;
    }
  </style>
</head>

<body>
  <table class="border" align="right">
    <thead>
      <tr>
        <th nowrap>${d.trad.number}</th>
        <th nowrap>${d.trad.date}</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td nowrap>DF-${d.order.order_id}-${d.order.id}</td>
        <td nowrap>${d.order.created_at}</td>
      </tr>
    </tbody>
  </table>

  <h1>${d.trad.invoice}</h1>

  <div class="clear small">
    <p><strong>
  ${d.seller.type === 'individual'
    ? `${d.seller.firstname} ${d.seller.lastname}`
    : d.seller.name
}
    </strong></p>
    <p>${d.seller.address}</p>
    <p>${d.seller.city} ${d.seller.zip_code}</p>
    <p>${d.seller.state} ${d.seller.country_name}</p>

  ${d.seller.type === 'company'
    ? `<p>${d.lang === 'fr' ? 'TVA intra.' : 'Tax intra'} : ${d.seller.tax_intra}</p>
     <p>${d.lang === 'fr' ? 'Numéro SIRET' : 'Registration number'} : ${d.seller.registration_number}</p>`
    : ''
}
    <br />
  </div>
  <div style="text-align: right">
    <p><strong>
    ${d.order.customer.type === 'individual'
    ? `${d.order.customer.firstname} ${d.order.customer.lastname}`
    : d.order.customer.name
}
    </strong></p>
    <p>${d.order.customer.address}</p>
    <p>${d.order.customer.city} ${d.order.customer.zip_code}</p>
    <p>${d.order.customer.state} ${d.order.customer.country_name}</p>

    ${d.order.customer.type === 'company'
    ? `<p>${d.lang === 'fr' ? 'TVA intra.' : 'Tax intra'} : ${d.order.customer.tax_intra}</p>
      <p>${d.lang === 'fr' ? 'Numéro SIRET' : 'Registration number'} : ${d.order.customer.registration_number}</p>`
    : ''
}
    <br />
  </div>

  <table class="border" style="width: 100%">
    <thead>
      <tr>
        <th>${d.trad.operations}</th>
        <th>${d.trad.unit_price}</th>
        <th>${d.trad.amount}</th>
        <th>Donation</th>
        <th>Total</th>
      </tr>
    </thead>
    <tbody>
${d.items.map(item => {
    return `<tr>
      <td>${item.name} - ${item.artist_name}</td>
      <td>${item.price} ${d.trad.currency}</td>
      <td>${item.quantity}</td>
      <td>${item.tips} ${d.trad.currency}</td>
      <td>${item.total} ${d.trad.currency}</td>
    </tr>`
  })}
    </tbody>
  </table>
  <br />

  <p>${d.trad.tva_rate} : ${d.order.tax_rate}%</p>

  <br />

  <table class="border" style="width: 50%;" align="right">
    <thead>
      <tr>
        <th nowrap>${d.trad.total_ht}</th>
        <th nowrap>${d.trad.shipping_costs}</th>
        <th nowrap>${d.trad.total_tva}</th>
        <th nowrap>${d.trad.total_ttc}</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td nowrap>${d.order.sub_total} ${d.trad.currency}</td>
        <td nowrap>${d.order.shipping} ${d.trad.currency}</td>
        <td nowrap>${d.order.tax} ${d.trad.currency}</td>
        <td nowrap>${d.order.total} ${d.trad.currency}</td>
      </tr>
    </tbody>
  </table>
</body>
</html>
`
module.exports = invoice
