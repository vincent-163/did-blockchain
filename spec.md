# spec

## block

```json
{
    "parentHash": "123",
    "hash": "456"
}
```

## tx

update: 更新或者添加一个 did
```json
{
    "action": "update",
    "name": "hwy123",
    "content": {}
}
```

delete: 删除一个 did
```json
{
    "action": "delete",
    "name": "hwy123"
}
```

verify: 对一个 did 验证签名
```json
{
    "hash": "b666329d641f4edc086945d83e46bd22",
    "action": "verify",
    "name": "hwy123",
    "data": []
}
```

submit: 回应一个 verify 操作。需要提供 zkSNARK 证明.
```json
{
    "action": "submit",
    "name": "hwy123",
    "verifyTxHash": "b666329d641f4edc086945d83e46bd22",
    "data": []
}
```