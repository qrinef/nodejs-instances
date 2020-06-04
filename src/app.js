const Redis = require('ioredis');

const redis = new Redis({host: 'redis'});
const subscriber = new Redis({host: 'redis'});
const publisher = new Redis({host: 'redis'});

let interval = null;

const cluster = () => {
    // Сохраняем номер того экземпляра, кто первый стал генератором
    // Остальных назначаем слушателями
    redis.setnx('generator', process.env.APP).then(result => {
        if (result) {
            generator(process.env.APP);
        } else {
            listener();
        }
    });
};

const generator = (generator) => {
    console.log('This instance assigned as generator')

    interval = setInterval(() => {
        // Выбираем среди активных экземпляров, кому отправить сообщение
        redis.lrange('instance', 0, -1).then(data => {
            // Игнорируем текущий экземпляр-генератор
            const instances = data.filter(x => x !== process.env.APP)
            const randInstance = instances[Math.floor(Math.random() * instances.length)];

            publisher.publish(`message:${randInstance}`, generator);
        });
    }, 1000);
};

const listener = () => {
    console.log('This instance assigned as listener')

    subscriber.on('message', (channel, message) => {
        console.log(`>> This message from instance #${message} to instance #${process.env.APP}, ${Date.now()}`);
    });
};

// Выбираем и запускаем генератора и слушателей
cluster();

// Сохраняем номер каждого экземпляра
// Необходимо при отправке сообщений, для случайного выбора среди активных экземпляров
redis.rpush('instance', process.env.APP);

// Подписываемся на события сообщений и завершения экзампляров
subscriber.subscribe(`message:${process.env.APP}`);
subscriber.subscribe('exit');

// Слушаем событие завершения экземпляров
subscriber.on('message', (channel, message) => {
    if (channel !== 'exit') return;

    console.log(`Instance #${message} has been disabled`);

    // Если экземпляр был генератором, останавливаем отправку сообщений
    if (interval) clearInterval(interval);

    // Удаляем завершенный экземпляр из массива активных экземпляров
    redis.lrem('instance', 1, message);

    // Выбираем и запускаем нового генератора и слушателей
    cluster();
});

// Отрабатываем заверешние экземпляра
process.on('SIGTERM', () => {
    // Удаляем текущий генератор
    redis.del('generator');

    // Отписываемся от событий на текущем экземпляре
    subscriber.unsubscribe();

    // Оповещаем все экземпяляры, какой отключился
    publisher.publish('exit', process.env.APP);

    console.log('This instance has been disabled');
});
