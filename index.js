//Добавляем нужные блоки кода из установленных модулей 
import { Bot, InlineKeyboard, session } from 'grammy';
import Binance from 'binance-api-node';
import fs from 'fs-extra';
import dotenv from 'dotenv';
import {Mutex, withTimeout} from 'async-mutex';
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
const mutex = new Mutex();

bot.use(session({ initial: () => ({
  notificationPair: false,
  notificationPrice: false,
  notificationDelete: false,
  notificationEdite: false,
  orderDelete: false,
  dataBase: {}, 
  dataMassive: [],
  orderMassive: [],
  orderPair: false,
  orderPairPrice: false,
  quantityToken: false,
  newPair: undefined,
  orderType: undefined,
  quantity: undefined,
  cancelOrder: undefined,
  order: {},
  publicApiKey: false,
  secretApiKey: false,
  tgApiKey: false
  }) 
}));

const 
  doesIdExist = (data, userId) => { // проверяем наличие нужного значения
    return data.id.some(obj => {    // возвращаем итог поиска по массиву id
      obj.hasOwnProperty(userId); // ищем совпадение в каждом объекте массива
      if (obj.hasOwnProperty(userId)) return true // если совпадает, сразу возвращаем true из функции       
    });
  },
  pullOutPairPrice = (data, userId, whereFind, ctx) => {//вытаскиваем пару и цену
    for (let i = 0; i < data.id.length; i++) {
      for (let f in data.id[i]) {
        if (+f == userId) {
          for (let j in data.id[i][f]) {
            if (j == whereFind) {                    
              for (let k = 0; k < data.id[i][f][j].length; k++) {
                for (let h in data.id[i][f][j][k]) {                                         
                  ctx.session.dataMassive[k] = `${h}: ${data.id[i][f][j][k][h]}\n`;
                  const {symbol, side, quantity, price} = data.id[i][f][j][k][h];                  
                  ctx.session.orderMassive[k] = `${k+1}:\nPair: ${symbol}\nOrder type: ${side}\nQuantity: ${quantity}\nPrice: ${price}\n\n`;
                }                 
              }
            } 
          }
        }
      }
    }    
  },
  EditeDelitePairPrice = async (data, userId, whereFind, target, Price, ctx) => {//редактирование торговых пар
    for (let i = 0; i < data.id.length; i++) {
      for (let f in data.id[i]) {
        if (+f == userId) {
          for (let j in data.id[i][f]) {
            if (j == whereFind) {                    
              for (let k = 0; k < data.id[i][f][j].length; k++) {
                for (let t in data.id[i][f][j][k]) {  
                  if (t == target) {             //target - наименование торговой пары        
                    if (ctx.session.notificationDelete) {
                      data.id[i][f][j].splice(k, 1); 
                      await fs.writeJson('./db.json', data); // перезапись файла
                      console.log('notification deleted');
                    }
                    if (ctx.session.notificationEdite) {       
                      ctx.session.notificationEdite = false;
                      ctx.session.notificationPrice = true;
                      ctx.session.newPair = t; //присваиваем новую пару для notificationPrice                       
                      console.log('edited!');
                    }
                    if (ctx.session.notificationPrice) { // блок редактирование пары
                      if (t == target && data.id[i][f][j][k][t] !== Price) { //если цена отличается убираем дубль
                        data.id[i][f][j].splice(k, 1);
                      }
                    }                 
                  }
                  if (ctx.session.orderDelete) {
                    if (k == target-1) {
                      console.log(data.id[i][f][j][target-1][t].orderId);
                      try {
                        ctx.session.cancelOrder = await client2.cancelOrder({ // отменяем на бирже
                          symbol: data.id[i][f][j][target-1][t].symbol,
                          orderId: data.id[i][f][j][target-1][t].orderId,
                        })
                        data.id[i][f][j].splice(target-1, 1);
                        await fs.writeJson('./db.json', data); // перезапись файла
                        console.log(ctx.session.cancelOrder); 
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
  resettingValues = (ctx) => { // сброс переменных
    ctx.session.notificationPair = false,
    ctx.session.notificationPrice = false,
    ctx.session.notificationDelete = false,
    ctx.session.notificationEdite = false,
    ctx.session.orderDelete = false,
    ctx.session.dataBase = {}, 
    ctx.session.dataMassive = [],
    ctx.session.orderMassive = [],
    ctx.session.orderPair = false,
    ctx.session.orderPairPrice = false,
    ctx.session.quantityToken = false,
    ctx.session.newPair = undefined,
    ctx.session.orderType = undefined,
    ctx.session.quantity = undefined,
    ctx.session.order = {},
    ctx.session.publicApiKey = false,
    ctx.session.secretApiKey = false,
    ctx.session.tgApiKey = false
  };


bot.command('start', async (ctx) => { 
  await mutex.runExclusive(async () => {
    try {
      const data = await fs.readJson('./db.json', { throws: false });
      let id = {}; 
      ctx.session.dataBase.id = [];    
      id[ctx.from.id] = {"notifications": [], "orders": []}; //создаем структуру объекта
      if (data == null) {  //файл пустой, записываем новый id 
        console.log('data == null')   
        ctx.session.dataBase.id.push(id);
        try {
          await fs.writeJson('./db.json', ctx.session.dataBase);
          console.log('id array was been create')
          ctx.session.dataBase = {};
        } catch (err) {
          console.error(err);
          console.log('error when writing the first data to an empty file');
        }
      }
      else { //заполненный файл 
        if (doesIdExist(data, ctx.from.id)) { //если id уже есть, то стоп 
          console.log('the id array already exists');
        }
        else { //если есть id, но отличный от пользователя, то создаем новый 
          try {
            data.id.push(id);
            await fs.writeJson('./db.json', data); 
            console.log('new id array was been create');
          } catch {
            console.error(err);
            console.log('error writing a new id to the file');
          }
        }
      }         
    } catch (err) {
      console.error(err)
      console.log('new id array was been create');
    }
  })
  resettingValues(ctx);
  const start_keyboard = new InlineKeyboard().text('place an order', 'order').text('set up a notification', 'notification');  
  await ctx.reply('Hello, With the help of this bot, when you reach a certain price of a cryptocurrency trading pair, you can send yourself a notification or immediately buy, having previously placed an order here.\n\nManage your balance without leaving Telegram.', {
      parse_mode: 'HTML',
      reply_markup: start_keyboard
  });           
});
bot.command('managing', (ctx) => {  
  resettingValues(ctx);
  const managing_keyboard = new InlineKeyboard().text('Orders', 'managing-order').text('Notifications', 'managing-notification'); 
  ctx.reply('what do you want to edit?', {
    reply_markup: managing_keyboard
  });          
});
bot.command('setapikey', (ctx) => {  
  resettingValues(ctx);
  const api_keyboard = new InlineKeyboard().text('Public', 'public-key').text('Secret', 'secret-key').text('TG', 'tg-key'); 
  ctx.reply('Select the API key to install', {
    reply_markup: api_keyboard
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
  },
  {
    command: 'setapikey',
    description: 'install API keys'
  }
]);


bot.callbackQuery(['notification'], async (ctx) => {
  ctx.session.notificationPair = true;
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
              pullOutPairPrice(data, ctx.from.id, 'notifications', ctx); 
              await ctx.reply(`Below is a list of active notifications.\n${ctx.session.dataMassive.join('')}\nTo begin editing or deleting, select an action and then write which pair you want to change.`, {
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
bot.callbackQuery(['delete-notification'], async (ctx) => {
  ctx.answerCallbackQuery('Deleting notifications');  
  ctx.session.notificationDelete = true;
  await ctx.reply(`Write the name of the pair you want to delete`);
});
bot.callbackQuery(['edit-notification'], async (ctx) => {
  ctx.answerCallbackQuery('Editing notifications');  
  ctx.session.notificationEdite = true;
  await ctx.reply(`Write the name of the pair you want to edite`);
});
bot.callbackQuery(['order'], async (ctx) => {    
  await ctx.answerCallbackQuery('Place an order'); 
  const orderType_keyboard = new InlineKeyboard().text('SELL', 'order-sell').text('BUY', 'order-buy');
  await ctx.reply('select the order type', {
    reply_markup: orderType_keyboard
  }); 
});
bot.callbackQuery(['order-sell'], async (ctx) => { 
  ctx.session.orderPair = true;
  ctx.session.orderType = 'SELL';
  await ctx.answerCallbackQuery('SELL');  
  await ctx.reply('OK, specify the trading pair for <b>SALE</b>, observing the format, for example "BTCUSDT" (without quotes).', {
    parse_mode: 'HTML'
  }); 
});
bot.callbackQuery(['order-buy'], async (ctx) => { 
  ctx.session.orderPair = true;
  ctx.session.orderType = 'BUY';
  await ctx.answerCallbackQuery('BUY');  
  await ctx.reply('OK, specify the trading pair for <b>BUY</b>, observing the format, for example "BTCUSDT" (without quotes).', {
    parse_mode: 'HTML'
  }); 
});
bot.callbackQuery(['confirmation'], async (ctx) => { // подтверждение заказа
  await ctx.answerCallbackQuery('Confirm');  
  console.log(ctx.session.order);
  let orderResult;   
  try {
    orderResult = await client2.order(ctx.session.order); //отправляем ордер на биржу
    ctx.session.order.orderId = orderResult.orderId; //помещаем orderId
    console.log('order is placed on the exchange')
    await mutex.runExclusive(async () => {
      const data = await fs.readJson('./db.json', { throws: false });
      for (let i = 0; i < data.id.length; i++) {
        for (let key in data.id[i]) {
          if (+key == ctx.from.id) {
            const orderDB = structuredClone(ctx.session.order);
            data.id[i][ctx.from.id].orders.push({orderDB}); //помещаем новый ордер в объект
            try {
              await fs.writeJson('./db.json', data); //записываем
              await ctx.reply(`New order is placed on the exchange. Viewing and deleting is available via the /managing command`); 
              console.log('file be updated');
            }
            catch (err) {
            console.log('the file could not be updated')
            console.error(err)
            }
          }
        } 
      } 
    })
  } catch (err) {
    console.error(err)
    console.log('error when placing an order on the exchange')
    await ctx.reply(`Error when placing an order on the exchange.\n${err}`); 
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
            pullOutPairPrice(data, ctx.from.id, 'orders', ctx)
            await ctx.reply(`Your active orders are below.\nTo <b>DELETE</b> one of them, write an ordinal number, for example "1".\n\n${ctx.session.orderMassive.join('')}`, {
              parse_mode: 'HTML'
            });
            ctx.session.orderDelete = true;      
          } else {await ctx.reply(`you don't have any active orders`);}
        } 
      }  
    }
  } catch (err) {
    console.error(err)
    console.log('file reading error')
  }
});
bot.callbackQuery(['public-key'], async (ctx) => { 
  ctx.session.publicApiKey = true;
  await ctx.answerCallbackQuery('Public');  
  await ctx.reply('Insert the <b>public</b> API key from Binance', {
    parse_mode: 'HTML'
  });
  ctx.session.publicApiKey = true; 
});
bot.callbackQuery(['secret-key'], async (ctx) => { 
  ctx.session.secretApiKey = true;
  await ctx.answerCallbackQuery('Secret');  
  await ctx.reply('Insert the <b>secret</b> API key from Binance', {
    parse_mode: 'HTML'
  });
  ctx.session.secretApiKey = true; 
});
bot.callbackQuery(['tg-key'], async (ctx) => { 
  ctx.session.tgApiKey = true;
  await ctx.answerCallbackQuery('Telegram');  
  await ctx.reply('Insert the <b>telegram</b> API key from @Botfather', {
    parse_mode: 'HTML'
  });
  ctx.session.tgApiKey = true; 
});



bot.on('message', async (ctx) => {      
  if (ctx.session.notificationPair) { // определяем пару с которой работаем
    //наименование редактируемой пары
    ctx.session.newPair = ctx.update.message.text; 
    try {
      const prices = await client.prices({ symbol: ctx.session.newPair }); // Получаем цены
      const exchangeInfo = await client.exchangeInfo({ symbol: ctx.session.newPair }); // Получаем инфо о парах
      //приводит к числу
      let pricePair = +prices[ctx.session.newPair]; 
      //информация о текущей цене
      await ctx.reply(`Current price ${exchangeInfo.symbols[0].baseAsset}: ${pricePair.toFixed(2)} ${exchangeInfo.symbols[0].quoteAsset}\nBelow, write the price for <b>${ctx.session.newPair}</b> for which you need an alert`, {
        parse_mode: 'HTML', 
    });
    ctx.session.notificationPair = false; 
    ctx.session.notificationPrice = true;     
    } catch (error) {    
      // Обработка ошибок  
      console.error('Error in getting the price.', error); 
      await ctx.reply(`Error in getting the price. ${error}`, error);      
    }
  }  
  else if (ctx.session.notificationPrice) {   // определяем цену для пары и записываем данные в объект
    await mutex.runExclusive(async () => {
      fs.readJson('./db.json', { throws: false })
      .then(async data => {
        try {          
          for (let i = 0; i < data.id.length; i++) {
            for (let key in data.id[i]) {
              if (+key == ctx.from.id) { // находим объект с id пользователя
                data.id[i][ctx.from.id].notifications.push({[ctx.session.newPair]: +ctx.update.message.text}); //помещаем новую пару в массив
                await EditeDelitePairPrice(data, ctx.from.id, 'notifications', ctx.session.newPair, +ctx.update.message.text, ctx);
                await fs.writeJson('./db.json', data); //записываем
                await ctx.reply(`A new notification has been installed for ${ctx.session.newPair}, it will work when the price reaches ${ctx.update.message.text}.\n\nActive notifications can be managed via the /managing command\nTo record another notification, use the /start command`);
              }
            } 
          } 
        } catch (err) {
          console.log('1: error in recording notifications');
          console.error(err)
        }    
      })
      .catch(err => {
        console.log('1: error reading the file');
        console.error(err)
      })
      .finally(() => { //сбрасываем переменные
        ctx.session.notificationPrice = false;
        ctx.session.newPair = undefined;      
      })
    });  
  } 
  else if (ctx.session.notificationDelete) { //удаление уведомлений
    await mutex.runExclusive(async () => {
      fs.readJson('./db.json')
      .then(async data => {
        await EditeDelitePairPrice(data, ctx.from.id, 'notifications', ctx.update.message.text, 0, ctx); //всё происходит в этой функции
        await ctx.reply(`The notification for the ${ctx.update.message.text} pair has been deleted`);
      })
      .catch(err => {
        console.log('2: error reading the file');
        console.error(err)
      })
      .finally(() => {
        ctx.session.notificationDelete = false;
      })
    }) 
  } 
  else if (ctx.session.notificationEdite) {//редактирование уведомлений
    await mutex.runExclusive(async () => {
      fs.readJson('./db.json')
      .then( async data => {
        await EditeDelitePairPrice(data, ctx.from.id, 'notifications', ctx.update.message.text, 0, ctx);  //всё происходит в этой функции     
        await ctx.reply(`Enter the new price for ${ctx.update.message.text}`);
      })
      .catch(err => {
        console.log('3: error reading the file');
        console.error(err)
      })
    })
  }
  else if (ctx.session.orderPair) { // наименование торговой пары
    ctx.session.newPair = ctx.update.message.text; //собираем инфо о наименовании
    try {
      const exchangeInfo = await client.exchangeInfo({ symbol: ctx.session.newPair }); // Получаем инфо о парах
      await ctx.reply(`Enter the amount of <b>${exchangeInfo.symbols[0].baseAsset}</b> to purchase.\nAccording to the Binance rules, the equivalent must be at least $5`, {
        parse_mode: 'HTML',
      }); 
      ctx.session.orderPair = false;
      ctx.session.quantityToken = true;   
    } catch (err) {
      console.log('error in determining the trading pair');
      console.error(err);
      await ctx.reply(`Error in determining the trading pair\n${err}`);
    }

  }
  else if (ctx.session.quantityToken) { // собираем данные о количестве монет
    ctx.session.quantity = ctx.update.message.text.replace(",", ".");
    await ctx.reply(`Write the price of the <b>${ctx.session.newPair}</b> order`, {
      parse_mode: 'HTML'
    }); 
    ctx.session.quantityToken = false;
    ctx.session.orderPairPrice = true; 
  }
  else if (ctx.session.orderPairPrice) { // цена ордера
    const сonfirm_keyboard = new InlineKeyboard().text('Confirm', 'confirmation');
    await ctx.reply(`Check if everything is in order:\n\nTrading pair: ${ctx.session.newPair}\nOrder type: ${ctx.session.orderType}\nQuantity: ${ctx.session.quantity}\nPrice: ${+ctx.update.message.text}`, {
      parse_mode: 'HTML',
      reply_markup: сonfirm_keyboard
    }); 
    
    ctx.session.order.symbol = ctx.session.newPair; //помещаем новую пару в массив
    ctx.session.order.side = ctx.session.orderType; //тип ордера
    ctx.session.order.quantity = +ctx.session.quantity; //Количество токенов для сделки
    ctx.session.order.price = +ctx.update.message.text; // цена

    ctx.session.newPair = undefined;
    ctx.session.orderType = undefined; 
    ctx.session.quantity = undefined; 
    ctx.session.orderPairPrice = false;
  }
  else if (ctx.session.orderDelete) { //удаление ордера
    await mutex.runExclusive(async () => {
      const data = await fs.readJson('./db.json', { throws: false });  
      await EditeDelitePairPrice(data, ctx.from.id, 'orders', +ctx.update.message.text, 0, ctx); //всё происходит тут 
    })
    await ctx.reply(`The order has been cancelled, the information is below.\n\nPair: ${ctx.session.cancelOrder.symbol}\nOrder type: ${ctx.session.cancelOrder.side}\nQuantity: ${ctx.session.cancelOrder.origQty}\nPrice: ${ctx.session.cancelOrder.price}\nStatus: <b>${ctx.session.cancelOrder.status}</b>`, {
      parse_mode: 'HTML' 
    }); // подтверждаем удаление пользователю
    console.log()  
    ctx.session.orderDelete = false;     
  }
  //установка API ключа 
  else if (ctx.session.publicApiKey) {   
    let envContent = await fs.readFile('./.env', "utf-8")
    const updatedContent = envContent.replace(/^BINACE_API_KEY=.*/m, `BINACE_API_KEY=${ctx.update.message.text}`);
    await fs.writeFile('./.env', updatedContent);
    await ctx.reply(`The public api key is installed`);
    ctx.session.publicApiKey = false;     
  }
  else if (ctx.session.secretApiKey) {   
    let envContent = await fs.readFile('./.env', "utf-8")
    const updatedContent = envContent.replace(/^BINACE_API_SECRET=.*/m, `BINACE_API_SECRET=${ctx.update.message.text}`);
    await fs.writeFile('./.env', updatedContent);
    await ctx.reply(`The secret api key is installed`);
    ctx.session.secretApiKey = false;     
  }
  else if (ctx.session.tgApiKey) {   
    let envContent = await fs.readFile('./.env', "utf-8")
    const updatedContent = envContent.replace(/^BOT_API_KEY=.*/m, `BOT_API_KEY=${ctx.update.message.text}`);
    await fs.writeFile('./.env', updatedContent);
    await ctx.reply(`The telegram api key is installed`);
    ctx.session.tgApiKey = false;     
  }
  else {console.log('the input is not recognized');} 
  
});  

//проверка цен ордеров и уведомлений с помощью сокетов (удержание соединения)
fs.readJson('./db.json')
.then(async data => {
  if (data !== null) { // если файл не пустой, то
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
                      await bot.api.sendMessage(userId, `${pairPrice} reached price ${bestBidPrice}`); // отправляем оповещение
                      data.id[i][userId][notificationOrOrder].splice(pairAndPrice, 1); // удаляем оповещение
                      console.log('pair has been delete');
                      await mutex.runExclusive(async () => {
                        try {
                          //обновляем данные в базе
                          await fs.writeJson('./db.json', data);
                          console.log('the database has been updated');
                        }   catch (err) {
                          console.log('error when overwriting the database');
                          console.error(err);
                        }
                      })
                    }
                  })
                  } catch {
                    console.log('1: connection to the exchange is lost');
                    console.error(err);
                  }                 
              }
              if (notificationOrOrder == 'orders') {
                try {
                  await client.ws.ticker(data.id[i][userId][notificationOrOrder][pairAndPrice].orderDB.symbol, async ticker => { // получаем цены от биржи                   
                    let bestBidPrice = ticker.bestBid; 
                    if (bestBidPrice <= data.id[i][userId][notificationOrOrder][pairAndPrice].orderDB.price) { //сравниваем их c ценами из базы
                      await bot.api.sendMessage(userId, `Your order has been executed.\n${data.id[i][userId][notificationOrOrder][pairAndPrice].orderDB.symbol} reached price ${bestBidPrice}`); // отправляем оповещение
                      data.id[i][userId][notificationOrOrder].splice(pairAndPrice, 1); // удаляем оповещение из базы
                      await mutex.runExclusive(async () => {
                        try {
                          //обновляем данные в базе
                          await fs.writeJson('./db.json', data);
                          console.log('pair on has been delete');
                        }   catch (err) {
                          console.log('error when overwriting the database');
                          console.error(err);
                        }
                      })
                    }
                  })
                } catch (err) {
                  console.log('2: connection to the exchange is lost');
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



  
