using System;
using System.Threading.Tasks;

public class OrderProcessor
{
    // SOLID SRP Violation: Combines user database persistence, emailing, and reporting in one class
    public void RegisterUser(string username) { }
    public void SaveOrderToDatabase(object order) { }
    public void SendInvoiceEmail(string email) { }
    public void GenerateOrderReport() { }

    // Async Void Violation
    public async void ProcessPaymentAsync()
    {
        // Null Dereference Violation: Dereferenced after FirstOrDefault without check
        var customer = GetCustomer();
        Console.WriteLine(customer.Name);

        // Blocking Task Violation: Result/Wait blocking
        var data = FetchDataAsync().Result;
    }

    private object GetCustomer() => null;
    private Task<string> FetchDataAsync() => Task.FromResult("data");
}
