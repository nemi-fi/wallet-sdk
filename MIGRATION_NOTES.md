# Migration Notes

## 0.87.2-next.5

Changes to authWitnesses creation. You no longer need to call `.request()`:

```diff
  pool.methods.swap(
    amountIn,
    amountOut,
    {
      authWitnesses: [
        usdc.methods.transfer(
          alice.getAddress(),
          pool.address,
          10,
-       ).request(),
+       ),
      ],
    },
  );
```
