//Добавляем нужные блоки кода из установленных модулей 
import { Bot, InlineKeyboard } from 'grammy';
import Binance from 'binance-api-node';
import fs from 'fs-extra';
import dotenv from 'dotenv';
dotenv.config();

//Развертываем Binance API
const client = Binance.default();
client.apiKey = process.env.BINACE_API_KEY;
client.apiSecret = process.env.BINACE_API_SECRET;

//Развертываем Telegram Bot
const bot = new Bot(process.env.BOT_API_KEY);

let
  notificationPair = false,
  notificationPrice = false,
  notificationDelete = false,
  notificationEdite = false,
  dataBase = {}, 
  newPair,
  dataMassive = [];

const 
  doesIdExist = (data, userId) => { // проверяем наличие нужного значения
    return data.id.some(obj => {    // возвращаем итог поиска по массиву id
      obj.hasOwnProperty(userId); // ищем совпадение в каждом объекте массива
      if (obj.hasOwnProperty(userId)) return true // если совпадает, сразу возвращаем true из функции       
    });
  },
  doesNotificationsExist = (data, userId) => {
    return data.id.some(obj => {    // возвращаем итог поиска
      const cloneObject = Object.assign({}, obj[userId]); //клонируем полученный объект для последующей работы
      if (cloneObject.hasOwnProperty('notifications')) return true //если в объекте есть уведомления возвращаем true из функции     
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
                  if (t == target) {                    
                    if (notificationDelete) {
                      data.id[i][f][j].splice(k, 1); 
                      await fs.writeJson('./db.json', data); // перезапись файла
                      console.log('deleted!');
                    }
                    if (notificationEdite) {       
                      notificationEdite = false;
                      notificationPrice = true;
                      newPair = t; //присваиваем новую пару для notificationPrice                       
                      console.log('edited!');
                    }
                    if (notificationPrice) {
                      if (t == target && data.id[i][f][j][k][t] !== Price) { //если цена отличается убираем дубль
                        data.id[i][f][j].splice(k, 1);
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
  }





bot.command('start', async (ctx) => {  
  try {
    const data = await fs.readJson('./db.json', { throws: false });
    let id = {}; 
    dataBase.id = [];    
    id[ctx.from.id] = {};   
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

  notificationPair = false;
  notificationPrice = false;
  notificationDelete = false;   
  const start_keyboard = new InlineKeyboard().text('place an order', 'order').text('set up a notification', 'notification');  
  await ctx.reply('Hello, With the help of this bot, when you reach a certain price of a cryptocurrency trading pair, you can send yourself a notification or immediately buy, having previously placed an order here.\n\nManage your balance without leaving Telegram.', {
      parse_mode: 'HTML',
      reply_markup: start_keyboard
  });           
});
bot.command('managing', (ctx) => {  
  notificationPair = false;
  notificationPrice = false;
  notificationDelete = false; 
  notificationEdite = false;
  const managing_keyboard = new InlineKeyboard().text('Orders', 'managing-order').text('Notifications', 'managing-notification'); 
  
  fs.readJson('./db.json', { throws: false })
  .then(data => {    
    if (doesNotificationsExist(data, ctx.from.id)) { // проверка на наличие уведомлений
      ctx.reply('what do you want to edit?', {
        reply_markup: managing_keyboard
    });    
    } else {ctx.reply(`you don't have any active notifications`);} 
  })
  .catch(err => {
    console.error(err)
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
bot.callbackQuery(['write-a-price'], async (ctx) => { 
  notificationPrice = true;
  await ctx.answerCallbackQuery('set up a notification');  
  await ctx.reply(`Below, write the price for <b>${newPair}</b> for which you need an alert`, {parse_mode: 'HTML'})
});
bot.callbackQuery(['managing-notification'], (ctx) => { 
  ctx.answerCallbackQuery('Notification management');  
  const managing_notification_keyboard = new InlineKeyboard().text('Edit ', 'edit-notification').text('Delete', 'delete-notification'); 
  fs.readJson('./db.json')
  .then(async data => {
    pullOutPairPrice(data, ctx.from.id, 'notifications'); 
    await ctx.reply(`Below is a list of active notifications.\n${dataMassive.join('')}\nTo begin editing or deleting, select an action and then write which pair you want to change.`, {
      reply_markup: managing_notification_keyboard
    });
  })        
  .catch(err => {
    console.error(err)
  })    
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



bot.on('message', async (ctx) => {      
  if (notificationPair) {
    //наименование редактируемой пары
    newPair = ctx.update.message.text; 
    try {
      const prices = await client.prices({ symbol: newPair }); // Получаем цены
      const exchangeInfo = await client.exchangeInfo({ symbol: newPair }); // Получаем инфо о парах
      //приводит к числу
      let pricePair = +prices[newPair]; 
      //информация о текущей цене
      const price_keyboard = new InlineKeyboard().text('Write a price', 'write-a-price');      
      await ctx.reply(`Current price ${exchangeInfo.symbols[0].baseAsset}: ${pricePair.toFixed(2)} ${exchangeInfo.symbols[0].quoteAsset}\n<b>To set the price</b> for the notification, <b>click "Write a price</b>"`, {
        parse_mode: 'HTML',        
        reply_markup: price_keyboard
    });
    notificationPair = false;      
    } catch (error) {    
      // Обработка ошибок  
      console.error('Error in getting the price.', error); 
      await ctx.reply(`Error in getting the price. ${error}`, error);      
    }
  }  
  if (notificationPrice) {    
    //читаем базу, проверяем факт наличия уведомлений
    fs.readJson('./db.json', { throws: false })
    .then(async data => {
      if (doesNotificationsExist(data, ctx.from.id)) { //уведомления есть, вкладываем новые в существующий массив
        console.log('the notifications already exists');
        try {          
          for (let i = 0; i < data.id.length; i++) {
            for (let key in data.id[i]) {
              if (+key == ctx.from.id) {
                data.id[i][ctx.from.id].notifications.push({[newPair]: +ctx.update.message.text}); //помещаем новую пару в массив
                EditeDelitePairPrice(data, ctx.from.id, 'notifications', newPair, +ctx.update.message.text);

                await fs.writeJson('./db.json', data); //записываем
                await ctx.reply(`A new notification has been installed for ${newPair}, it will work when the price reaches ${ctx.update.message.text}\n\nActive notifications can be managed via the /managing command\nTo record another notification, use the /start command`);
              }
            } 
          } 
        } catch (err) {
          console.error(err)
        }
      } else { //уведомлений нет, создаем массив "notification" в объекте 
        fs.readJson('./db.json')
        .then(async data => {  
          for (let i = 0; i < data.id.length; i++) {
            for (let key in data.id[i]) {
              if (+key == ctx.from.id) {
                data.id[i][ctx.from.id].notifications = [{[newPair]: +ctx.update.message.text}]; //создаем массив "notification"                
                await fs.writeJson('./db.json', data);
                await ctx.reply(`A new notification has been installed for ${newPair}, it will work when the price reaches ${ctx.update.message.text}\n\nActive notifications can be managed via the /managing command`);
              }
            } 
          }
        })
        .catch(err => {
          console.error(err)
        });        
      }      
    })
    .catch(err => {
      console.error(err)
    })
    .finally(() => {
      notificationPrice = false;
      newPair = undefined;      
    });   
  } 
  if (notificationDelete) {
    //читаем, что сейчас есть в базе
    fs.readJson('./db.json')
    .then(async data => {
      EditeDelitePairPrice(data, ctx.from.id, 'notifications', ctx.update.message.text);
      await ctx.reply(`The notification for the ${ctx.update.message.text} pair has been deleted`);
    })
    .catch(err => {
      console.error(err)
    })
    .finally(() => {
      notificationDelete = false;
    }); 
    } 
  if (notificationEdite) {
    fs.readJson('./db.json')
    .then( async data => {
      EditeDelitePairPrice(data, ctx.from.id, 'notifications', ctx.update.message.text);      
      await ctx.reply(`Enter the new price for ${ctx.update.message.text}`);
    })
    .catch(err => {
      console.error(err)
    })
  }
  
});




// проверка цен каждую минуту
setInterval(async () => {
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
  
}, 60000);


bot.start();


// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM')); 



  
