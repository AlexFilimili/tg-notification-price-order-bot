//Добавляем нужные блоки кода из установленных модулей 
import { Bot, InlineKeyboard } from 'grammy';
import Binance from 'binance-api-node';
import fs from 'fs-extra';
import dotenv from 'dotenv';
dotenv.config();

//Развертываем Binance API
const client = Binance.default();
const client2 = Binance.default({
  apiKey: process.env.BINACE_API_KEY,
  apiSecret: process.env.BINACE_API_SECRET,
  useServerTime: true
})

console.log(await client.ping());
console.log(await client2.time()-Date.now()); // разница во времени с биржей

//Развертываем Telegram Bot
const bot = new Bot(process.env.BOT_API_KEY); 

let
  notificationPair = false,
  notificationPrice = false,
  notificationDelete = false,
  notificationEdite = false,
  orderDelete = false,
  dataBase = {}, 
  dataMassive = [],
  orderMassive = [],
  orderPair = false,
  orderPairPrice = false,
  quantityToken = false,
  newPair,
  orderType,
  quantity,
  cancelOrder,
  order = {};

const 
  doesIdExist = (data, userId) => { // проверяем наличие нужного значения
    return data.id.some(obj => {    // возвращаем итог поиска по массиву id
      obj.hasOwnProperty(userId); // ищем совпадение в каждом объекте массива
      if (obj.hasOwnProperty(userId)) return true // если совпадает, сразу возвращаем true из функции       
    });
  },
  pullOutPairPrice = (data, userId, whereFind) => {//вытаскиваем пару и цену
    for (let i = 0; i < data.id.length; i++) {
      for (let f in data.id[i]) {
        if (+f == userId) {
          for (let j in data.id[i][f]) {
            if (j == whereFind) {                    
              for (let k = 0; k < data.id[i][f][j].length; k++) {
                for (let h in data.id[i][f][j][k]) {                                         
                  dataMassive[k] = `${h}: ${data.id[i][f][j][k][h]}\n`;
                  const {symbol, side, quantity, price} = data.id[i][f][j][k][h];                  
                  orderMassive[k] = `${k+1}:\nPair: ${symbol}\nOrder type: ${side}\nQuantity: ${quantity}\nPrice: ${price}\n\n`;
                }                 
              }
            } 
          }
        }
      }
    }    
  },
  EditeDelitePairPrice = async (data, userId, whereFind, target, Price) => {//редактирование торговых пар
    for (let i = 0; i < data.id.length; i++) {
      for (let f in data.id[i]) {
        if (+f == userId) {
          for (let j in data.id[i][f]) {
            if (j == whereFind) {                    
              for (let k = 0; k < data.id[i][f][j].length; k++) {
                for (let t in data.id[i][f][j][k]) {  
                  if (t == target) {             //target - наименование торговой пары        
                    if (notificationDelete) {
                      data.id[i][f][j].splice(k, 1); 
                      await fs.writeJson('./db.json', data); // перезапись файла
                      console.log('notification deleted');
                    }
                    if (notificationEdite) {       
                      notificationEdite = false;
                      notificationPrice = true;
                      newPair = t; //присваиваем новую пару для notificationPrice                       
                      console.log('edited!');
                    }
                    if (notificationPrice) { // блок редактирование пары
                      if (t == target && data.id[i][f][j][k][t] !== Price) { //если цена отличается убираем дубль
                        data.id[i][f][j].splice(k, 1);
                      }
                    }                 
                  }
                  if (orderDelete) {
                    if (k == target-1) {
                      console.log(data.id[i][f][j][target-1][t].orderId);
                      try {
                        cancelOrder = await client2.cancelOrder({ // отменяем на бирже
                          symbol: data.id[i][f][j][target-1][t].symbol,
                          orderId: data.id[i][f][j][target-1][t].orderId,
                        })
                        data.id[i][f][j].splice(target-1, 1);
                        await fs.writeJson('./db.json', data); // перезапись файла
                        console.log(cancelOrder); 
                      } catch (err){
                        console.error(err)
                        console.log('error when canceling an order')
                      }
                    }
                  }
                }                
              }
            } 
          }
        }
      }
    }   
  },
  resettingValues = () => { // сброс переменных
    notificationPair = false,
    notificationPrice = false,
    notificationDelete = false,
    notificationEdite = false,
    orderDelete = false,
    dataBase = {}, 
    dataMassive = [],
    orderMassive = [],
    orderPair = false,
    orderPairPrice = false,
    quantityToken = false,
    newPair = undefined,
    orderType = undefined,
    quantity = undefined,
    order = {};
  }


bot.command('start', async (ctx) => {  
  try {
    const data = await fs.readJson('./db.json', { throws: false });
    let id = {}; 
    dataBase.id = [];    
    id[ctx.from.id] = {"notifications": [], "orders": []}; //создаем структуру объекта
    if (data == null) {  //файл пустой, записываем новый id 
      console.log('data == null')   
      dataBase.id.push(id);
      await fs.writeJson('./db.json', dataBase);
      console.log('id array was been create')
      dataBase = {};
    }
    else { //заполненный файл 
      if (doesIdExist(data, ctx.from.id)) { //если id уже есть, то стоп 
        console.log('the id array already exists');
      }
      else { //если есть id, но отличный от пользователя, то создаем новый 
        data.id.push(id);
        await fs.writeJson('./db.json', data); 
        console.log('new id array was been create');
      }
    }         
  } catch (err) {
    console.error(err)
  }
  resettingValues();
  const start_keyboard = new InlineKeyboard().text('place an order', 'order').text('set up a notification', 'notification');  
  await ctx.reply('Hello, With the help of this bot, when you reach a certain price of a cryptocurrency trading pair, you can send yourself a notification or immediately buy, having previously placed an order here.\n\nManage your balance without leaving Telegram.', {
      parse_mode: 'HTML',
      reply_markup: start_keyboard
  });           
});
bot.command('managing', (ctx) => {  
  resettingValues();
  const managing_keyboard = new InlineKeyboard().text('Orders', 'managing-order').text('Notifications', 'managing-notification'); 
  ctx.reply('what do you want to edit?', {
    reply_markup: managing_keyboard
  });          
});
bot.api.setMyCommands([
  {
  command: 'start',
  description: 'setting up notifications and orders'
  },
  {
  command: 'managing',
  description: 'viewing and editing notifications and orders'
  }
]);


bot.callbackQuery(['notification'], async (ctx) => { 
  notificationPair = true;
  await ctx.answerCallbackQuery('set up a notification');  
  await ctx.reply('ok, write a trading pair, observing the format, for example "BTCUSDT" (without quotes)'); 
});
bot.callbackQuery(['managing-notification'], (ctx) => { 
  ctx.answerCallbackQuery('Notification management'); 
  const managing_notification_keyboard = new InlineKeyboard().text('Edit ', 'edit-notification').text('Delete', 'delete-notification'); 
  fs.readJson('./db.json', { throws: false })
  .then(async data => { 
    try {
      for (let i = 0; i < data.id.length; i++) {
        for (let f in data.id[i][ctx.from.id]) {
          if (f == 'notifications') {
            if (data.id[i][ctx.from.id].notifications.length > 0) { //проверка наличия уведомлений
              pullOutPairPrice(data, ctx.from.id, 'notifications'); 
              await ctx.reply(`Below is a list of active notifications.\n${dataMassive.join('')}\nTo begin editing or deleting, select an action and then write which pair you want to change.`, {
                reply_markup: managing_notification_keyboard
              });     
            } else {
              await ctx.reply(`you don't have any active notifications`); 
            }
          } 
        }  
      }
    } catch (err) {
      console.error(err)
      console.log('2: err read db file')
    } 
  })
  .catch(err => {
    console.log('3: err read db file')
    console.error(err) 
  });  
  
});
bot.callbackQuery(['delete-notification'], (ctx) => {
  ctx.answerCallbackQuery('Deleting notifications');  
  notificationDelete = true;
  ctx.reply(`Write the name of the pair you want to delete`);
});
bot.callbackQuery(['edit-notification'], (ctx) => {
  ctx.answerCallbackQuery('Editing notifications');  
  notificationEdite = true;
  ctx.reply(`Write the name of the pair you want to edite`);
});
bot.callbackQuery(['order'], async (ctx) => {    
  await ctx.answerCallbackQuery('Place an order'); 
  const orderType_keyboard = new InlineKeyboard().text('SELL', 'order-sell').text('BUY', 'order-buy');
  await ctx.reply('select the order type', {
    reply_markup: orderType_keyboard
  }); 
});
bot.callbackQuery(['order-sell'], async (ctx) => { 
  orderPair = true;
  orderType = 'SELL';
  await ctx.answerCallbackQuery('SELL');  
  await ctx.reply('OK, specify the trading pair for <b>SALE</b>, observing the format, for example "BTCUSDT" (without quotes).', {
    parse_mode: 'HTML'
  }); 
});
bot.callbackQuery(['order-buy'], async (ctx) => { 
  orderPair = true;
  orderType = 'BUY';
  await ctx.answerCallbackQuery('BUY');  
  await ctx.reply('OK, specify the trading pair for <b>BUY</b>, observing the format, for example "BTCUSDT" (without quotes).', {
    parse_mode: 'HTML'
  }); 
});
bot.callbackQuery(['confirmation'], async (ctx) => {
  await ctx.answerCallbackQuery('Confirm');  
  console.log(order);
  let orderResult;   
  try {
    orderResult = await client2.order(order); //отправляем ордер на биржу
    order.orderId = orderResult.orderId; //помещаем orderId
    console.log('order is placed on the exchange')
  } catch (err) {
    console.error(err)
    console.log('error when placing an order on the exchange')
  }
  const data = await fs.readJson('./db.json', { throws: false });
  for (let i = 0; i < data.id.length; i++) {
    for (let key in data.id[i]) {
      if (+key == ctx.from.id) {
        data.id[i][ctx.from.id].orders.push({order}); //помещаем новый ордер в объект
        try {
          await fs.writeJson('./db.json', data); //записываем
          await ctx.reply(`New order is placed on the exchange. Viewing and deleting is available via the /managing command`); 
          console.log('file be updated')
        }
        catch (err) {
        console.log('the file could not be updated')
        console.error(err)
        }
      }
    } 
  }  
});
bot.callbackQuery(['managing-order'], async (ctx) => {
  await ctx.answerCallbackQuery('Orders'); 
  try {
    const data = await fs.readJson('./db.json', { throws: false });
    for (let i = 0; i < data.id.length; i++) {
      for (let f in data.id[i][ctx.from.id]) {
        if (f == 'orders') {
          if (data.id[i][ctx.from.id].orders.length > 0) { //проверка наличия ордеров
            pullOutPairPrice(data, ctx.from.id, 'orders')
            await ctx.reply(`Your active orders are below.\nTo <b>DELETE</b> one of them, write an ordinal number, for example "1".\n\n${orderMassive.join('')}`, {
              parse_mode: 'HTML'
            });
            orderDelete = true;      
          } else {await ctx.reply(`you don't have any active orders`);}
        } 
      }  
    }
  } catch (err) {
    console.error(err)
    console.log('file reading error')
  }
});


bot.on('message', async (ctx) => {      
  if (notificationPair) { // определяем пару с которой работаем
    //наименование редактируемой пары
    newPair = ctx.update.message.text; 
    try {
      const prices = await client.prices({ symbol: newPair }); // Получаем цены
      const exchangeInfo = await client.exchangeInfo({ symbol: newPair }); // Получаем инфо о парах
      //приводит к числу
      let pricePair = +prices[newPair]; 
      //информация о текущей цене
      await ctx.reply(`Current price ${exchangeInfo.symbols[0].baseAsset}: ${pricePair.toFixed(2)} ${exchangeInfo.symbols[0].quoteAsset}\nBelow, write the price for <b>${newPair}</b> for which you need an alert`, {
        parse_mode: 'HTML', 
    });
    notificationPair = false; 
    notificationPrice = true;     
    } catch (error) {    
      // Обработка ошибок  
      console.error('Error in getting the price.', error); 
      await ctx.reply(`Error in getting the price. ${error}`, error);      
    }
  }  
  else if (notificationPrice) {   // определяем цену для пары и записываем данные в объект
    fs.readJson('./db.json', { throws: false })
    .then(async data => {
      try {          
        for (let i = 0; i < data.id.length; i++) {
          for (let key in data.id[i]) {
            if (+key == ctx.from.id) { // находим объект с id пользователя
              data.id[i][ctx.from.id].notifications.push({[newPair]: +ctx.update.message.text}); //помещаем новую пару в массив
              EditeDelitePairPrice(data, ctx.from.id, 'notifications', newPair, +ctx.update.message.text);
              await fs.writeJson('./db.json', data); //записываем
              await ctx.reply(`A new notification has been installed for ${newPair}, it will work when the price reaches ${ctx.update.message.text}\n\nActive notifications can be managed via the /managing command\nTo record another notification, use the /start command`);
            }
          } 
        } 
      } catch (err) {
        console.log('1: error in recording notifications');
        console.error(err)
      }    
    })
    .catch(err => {
      console.error(err)
    })
    .finally(() => { //сбрасываем переменные
      notificationPrice = false;
      newPair = undefined;      
    });   
  } 
  else if (notificationDelete) { //удаление уведомлений
    fs.readJson('./db.json')
    .then(async data => {
      EditeDelitePairPrice(data, ctx.from.id, 'notifications', ctx.update.message.text); //всё происходит в этой функции
      await ctx.reply(`The notification for the ${ctx.update.message.text} pair has been deleted`);
    })
    .catch(err => {
      console.error(err)
    })
    .finally(() => {
      notificationDelete = false;
    }); 
    } 
  else if (notificationEdite) {//редактирование уведомлений
    fs.readJson('./db.json')
    .then( async data => {
      EditeDelitePairPrice(data, ctx.from.id, 'notifications', ctx.update.message.text);  //всё происходит в этой функции     
      await ctx.reply(`Enter the new price for ${ctx.update.message.text}`);
    })
    .catch(err => {
      console.error(err)
    })
  }
  else if (orderPair) { // наименование торговой пары
    newPair = ctx.update.message.text; //собираем инфо о наименовании
    const exchangeInfo = await client.exchangeInfo({ symbol: newPair }); // Получаем инфо о парах
    await ctx.reply(`Enter the amount of <b>${exchangeInfo.symbols[0].baseAsset}</b> to purchase.`, {
      parse_mode: 'HTML',
    }); 
    orderPair = false;
    quantityToken = true;   
  }
  else if (quantityToken) { // собираем данные о количестве монет
    quantity = ctx.update.message.text.replace(",", ".");
    await ctx.reply(`Write the price of the <b>${newPair}</b> order`, {
      parse_mode: 'HTML'
    }); 
    quantityToken = false;
    orderPairPrice = true; 
  }
  else if (orderPairPrice) { // цена ордера
    const сonfirm_keyboard = new InlineKeyboard().text('Confirm', 'confirmation');
    await ctx.reply(`Check if everything is in order:\n\nTrading pair: ${newPair}\nOrder type: ${orderType}\nQuantity: ${quantity}\nPrice: ${+ctx.update.message.text}`, {
      parse_mode: 'HTML',
      reply_markup: сonfirm_keyboard
    }); 
    
    order.symbol = newPair; //помещаем новую пару в массив
    order.side = orderType; //тип ордера
    order.quantity = +quantity; //Количество токенов для сделки
    order.price = +ctx.update.message.text; // цена

    newPair = undefined;
    orderType = undefined; 
    quantity = undefined; 
    orderPairPrice = false;
  }
  else if (orderDelete) { //удаление ордера
    const data = await fs.readJson('./db.json', { throws: false });  
    await EditeDelitePairPrice(data, ctx.from.id, 'orders', +ctx.update.message.text); //всё происходит тут 
    await ctx.reply(`The order has been cancelled, the information is below.\n\nPair: ${cancelOrder.symbol}\nOrder type: ${cancelOrder.side}\nQuantity: ${cancelOrder.origQty}\nPrice: ${cancelOrder.price}\nStatus: <b>${cancelOrder.status}</b>`, {
      parse_mode: 'HTML' 
    }); // подтверждаем удаление пользователю
    console.log()  
    orderDelete = false;    
  }
  else {console.log('the input is not recognized')} 
});  

//проверка цен с помощью вебсокетов(удержание соединения)
fs.readJson('./db.json')
.then(async data => {
  for (let i = 0; i < data.id.length; i++ ) {
    for (let userId in data.id[i]) {
      for (let notificationOrOrder in data.id[i][userId]) {
        for (let pairAndPrice = 0; pairAndPrice < data.id[i][userId][notificationOrOrder].length; pairAndPrice++) {
          for (let pairPrice in data.id[i][userId][notificationOrOrder][pairAndPrice]) {
            if (notificationOrOrder == 'notifications') { 
              try {
                await client.ws.ticker(pairPrice, async ticker => { // получаем цены от биржи                   
                  let bestBidPrice = ticker.bestBid; 
                  if (bestBidPrice <= data.id[i][userId][notificationOrOrder][pairAndPrice][pairPrice]) { //сравниваем их c ценами из базы
                    await bot.api.sendMessage(434059214, `${pairPrice} reached price ${bestBidPrice}`); // отправляем оповещение
                    data.id[i][userId][notificationOrOrder].splice(pairAndPrice, 1); // удаляем оповещение
                    console.log('pair has been delete');
                    try {
                      //обновляем данные в базе
                      await fs.writeJson('./db.json', data);
                      console.log('the database has been updated');
                    }   catch (err) {
                      console.log('error when overwriting the database');
                      console.error(err);
                    }
                  }
                })
                } catch {
                  console.log('connection to the exchange is lost');
                  console.error(err);
                }                 
            }
            if (notificationOrOrder == 'orders') {
              try {
                await client.ws.ticker(data.id[i][userId][notificationOrOrder][pairAndPrice].order.symbol, async ticker => { // получаем цены от биржи                   
                  let bestBidPrice = ticker.bestBid; 
                  if (bestBidPrice <= data.id[i][userId][notificationOrOrder][pairAndPrice].order.price) { //сравниваем их c ценами из базы
                    await bot.api.sendMessage(434059214, `${data.id[i][userId][notificationOrOrder][pairAndPrice].order.symbol} reached price ${bestBidPrice}`); // отправляем оповещение
                    data.id[i][userId][notificationOrOrder].splice(pairAndPrice, 1); // удаляем оповещение
                    console.log('pair has been delete');
                    try {
                      //обновляем данные в базе
                      await fs.writeJson('./db.json', data);
                      console.log('the database has been updated');
                    }   catch (err) {
                      console.log('error when overwriting the database');
                      console.error(err);
                    }
                  }
                })
              } catch {
                console.log('connection to the exchange is lost');
                console.error(err);
              } 
            }
          }
        }
      }
    }
  }
})
.catch(err => {
  console.log('error when reading from the database')
  console.error(err)
})

// проверка цен каждую минуту через конечные точки
/* setInterval(async () => {
fs.readJson('./db.json')
.then(async data => {
  for (let i = 0; i < data.id.length; i++ ) {
    for (let userId in data.id[i]) {
      for (let notificationOrOrder in data.id[i][userId]) {
        for (let pairAndPrice = 0; pairAndPrice < data.id[i][userId][notificationOrOrder].length; pairAndPrice++) {
          for (let pairPrice in data.id[i][userId][notificationOrOrder][pairAndPrice]) {
            if (notificationOrOrder == 'notifications') {              
              const priceNow = await client.prices({ symbol: pairPrice });   // получаем цены от биржи  
              console.log('prices have been received')         
              if (priceNow[pairPrice] <= data.id[i][userId][notificationOrOrder][pairAndPrice][pairPrice]) { //сравниваем их ценами из базы
                await bot.api.sendMessage(434059214, `${pairPrice} reached price ${priceNow[pairPrice]}`); // отправляем оповещение
                data.id[i][userId][notificationOrOrder].splice(pairAndPrice, 1); // удаляем оповещение
                console.log('pair has been delete')
                try {
                  //обновляем данные в базе
                  await fs.writeJson('./db.json', data);
                  console.log('the database has been updated');
                }   catch (err) {
                  console.log('error when overwriting the database');
                  console.error(err);
                }
              }
            }
          }
        }
      }
    }
  }
})
.catch(err => {
  console.log('error when reading from the database')
  console.error(err)
})
  
}, 60000); */

bot.start();

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM')); 



  
